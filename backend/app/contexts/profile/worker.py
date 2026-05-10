"""arq worker jobs for the profile context.

parse_resume: extract text from PDF/DOCX, call LLM, write Profile + sub-tables,
              publish ProfileParsed outbox event.
"""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, delete

from app.db.session import async_session_factory
from app.db.models.profile import (
    ProfileResumeSource,
    ProfileProfile,
    ProfileEducation,
    ProfileWorkExperience,
    ProfileProject,
    ProfileSkill,
    ProfileMaterial,
)
from app.db.models.outbox import OutboxEvent
from app.security.crypto import encrypt_field

logger = logging.getLogger(__name__)


async def parse_resume(ctx: dict, resume_id: str) -> None:
    """
    arq job: load PDF/DOCX, call LLM to extract profile data,
    write Profile + sub-tables, publish ProfileParsed outbox event.
    """
    async with async_session_factory() as session:
        # 1. Load resume record
        result = await session.execute(
            select(ProfileResumeSource).where(ProfileResumeSource.id == resume_id)
        )
        record = result.scalar_one_or_none()
        if not record:
            logger.error("parse_resume: resume_id=%s not found", resume_id)
            return

        try:
            # 2. Download from S3
            raw_bytes = await _download_from_s3(record.blob_uri)

            # 3. Extract text
            text = _extract_text(record.content_type, raw_bytes)

            # 4. Call LLM to parse
            parsed = await _call_llm_parse(text)

            # 5. Write Profile + sub-tables
            await _write_profile(session, record.user_id, parsed, text)

            # 6. Mark parse status DONE
            record.parse_status = "DONE"
            record.parse_error = None

            # 7. Publish outbox event
            from python_ulid import ULID
            outbox = OutboxEvent(
                id=str(ULID()),
                event_type="ProfileParsed",
                payload={"user_id": record.user_id, "resume_id": resume_id},
                consumer_group="profile",
            )
            session.add(outbox)

            await session.commit()
            logger.info("parse_resume: resume_id=%s done", resume_id)

        except Exception as exc:
            logger.exception("parse_resume: resume_id=%s failed: %s", resume_id, exc)
            record.parse_status = "ERROR"
            record.parse_error = str(exc)
            await session.commit()
            raise


# ------------------------------------------------------------------
# S3 download
# ------------------------------------------------------------------

async def _download_from_s3(blob_uri: str) -> bytes:
    """Download blob from S3 using blob_uri in the form s3://bucket/key."""
    import aioboto3
    from app.config import settings

    # Parse s3://bucket/key
    without_scheme = blob_uri[len("s3://"):]
    bucket, _, key = without_scheme.partition("/")

    boto_session = aioboto3.Session()
    async with boto_session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
    ) as s3:
        response = await s3.get_object(Bucket=bucket, Key=key)
        return await response["Body"].read()


# ------------------------------------------------------------------
# Text extraction
# ------------------------------------------------------------------

def _extract_text(content_type: str, data: bytes) -> str:
    """Extract plain text from PDF or DOCX."""
    if content_type == "application/pdf":
        return _extract_pdf(data)
    elif content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx(data)
    else:
        raise ValueError(f"Unsupported content type: {content_type}")


def _extract_pdf(data: bytes) -> str:
    from pdfminer.high_level import extract_text as pdfminer_extract

    return pdfminer_extract(io.BytesIO(data))


def _extract_docx(data: bytes) -> str:
    import docx

    doc = docx.Document(io.BytesIO(data))
    return "\n".join(paragraph.text for paragraph in doc.paragraphs)


# ------------------------------------------------------------------
# LLM parse
# ------------------------------------------------------------------

async def _call_llm_parse(text: str) -> dict[str, Any]:
    """Call LLM to extract structured profile data from resume text."""
    from app.llm.client import LLMClient
    from app.llm.provider import LLMMessage
    from app.config import settings

    system_prompt = (
        "You are a resume parser. Extract structured data from the provided resume text. "
        "Return a JSON object with the following keys: "
        "basic_info (name, email, phone, location, linkedin, github, summary), "
        "education (list of {school, degree, major, start, end, gpa, highlights}), "
        "work_experience (list of {company, title, location, start, end, bullets}), "
        "projects (list of {name, description, start, end}), "
        "skills (list of {name, kind} where kind is HARD/SOFT/TOOL), "
        "certifications (list of {name, issuer, date}), "
        "materials (list of {raw_text, shining_text, rationale, tags, provenance_kind='resume'}). "
        "Return only the JSON object, no markdown."
    )

    client = LLMClient()
    messages = [
        LLMMessage(role="system", content=system_prompt),
        LLMMessage(role="user", content=f"Resume text:\n\n{text[:12000]}"),
    ]

    response_text = ""
    async for event in client.stream(model="gpt-4.1-mini", messages=messages):
        if event.kind == "text_delta":
            response_text += event.delta

    # Strip markdown code fences if present
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1]) if len(lines) > 2 else cleaned

    return json.loads(cleaned)


# ------------------------------------------------------------------
# DB write
# ------------------------------------------------------------------

async def _write_profile(
    session: Any,
    user_id: str,
    parsed: dict[str, Any],
    raw_text: str,
) -> None:
    """Write parsed profile data into DB tables."""
    from python_ulid import ULID

    # Upsert ProfileProfile
    result = await session.execute(
        select(ProfileProfile).where(ProfileProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = ProfileProfile(user_id=user_id)
        session.add(profile)

    profile.basic_info = parsed.get("basic_info")
    profile.certifications = parsed.get("certifications")
    profile.last_resume_uploaded_at = datetime.now(timezone.utc)

    # Education (replace existing)
    await session.execute(
        delete(ProfileEducation).where(ProfileEducation.user_id == user_id)
    )
    for edu in parsed.get("education", []):
        session.add(ProfileEducation(
            id=str(ULID()),
            user_id=user_id,
            school=edu.get("school", ""),
            degree=edu.get("degree"),
            major=edu.get("major"),
            start=edu.get("start"),
            end=edu.get("end"),
            gpa=edu.get("gpa"),
            highlights=edu.get("highlights"),
        ))

    # Work experience (replace existing)
    await session.execute(
        delete(ProfileWorkExperience).where(ProfileWorkExperience.user_id == user_id)
    )
    for work in parsed.get("work_experience", []):
        session.add(ProfileWorkExperience(
            id=str(ULID()),
            user_id=user_id,
            company=work.get("company", ""),
            title=work.get("title", ""),
            location=work.get("location"),
            start=work.get("start"),
            end=work.get("end"),
            bullets=work.get("bullets"),
        ))

    # Projects (replace existing)
    await session.execute(
        delete(ProfileProject).where(ProfileProject.user_id == user_id)
    )
    for proj in parsed.get("projects", []):
        session.add(ProfileProject(
            id=str(ULID()),
            user_id=user_id,
            name=proj.get("name", ""),
            description=proj.get("description"),
            start=proj.get("start"),
            end=proj.get("end"),
        ))

    # Skills (replace existing)
    await session.execute(
        delete(ProfileSkill).where(ProfileSkill.user_id == user_id)
    )
    for skill in parsed.get("skills", []):
        session.add(ProfileSkill(
            id=str(ULID()),
            user_id=user_id,
            name=skill.get("name", ""),
            kind=skill.get("kind", "HARD"),
        ))

    # Materials (append, don't replace)
    encrypted_raw = encrypt_field(raw_text)
    for mat in parsed.get("materials", []):
        raw = mat.get("raw_text", "")
        session.add(ProfileMaterial(
            id=str(ULID()),
            user_id=user_id,
            raw_text=encrypt_field(raw) if raw else encrypted_raw,
            shining_text=mat.get("shining_text"),
            rationale=mat.get("rationale"),
            tags=mat.get("tags"),
            quant=mat.get("quant"),
            provenance_kind="resume",
            provenance_data={"resume_text_preview": raw[:200] if raw else ""},
            status="PROPOSED",
        ))
