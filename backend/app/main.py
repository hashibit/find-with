"""FindWith API — v0.1 monolith."""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.session import engine, async_session_factory
from app.observability import init_sentry, init_otel


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup/shutdown hooks."""
    # Startup
    init_sentry()
    init_otel()

    # Verify encryption keys (fail-fast if KEK is wrong)
    if settings.environment != "test":
        from app.security.crypto import verify_encryption_keys
        verify_encryption_keys()

    yield

    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="FindWith API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health ---

@app.get("/v1/health")
async def health():
    """Liveness: process alive, no dependency checks."""
    return {"status": "ok"}


@app.get("/v1/ready")
async def ready():
    """Readiness: DB + Redis + LLM probe."""
    checks: dict[str, str] = {}

    # DB
    try:
        async with async_session_factory() as session:
            await session.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "fail"

    # Redis
    try:
        from app.db.redis import redis_pool
        pong = await redis_pool.ping()
        checks["redis"] = "ok" if pong else "fail"
    except Exception:
        checks["redis"] = "fail"

    # LLM (HEAD probe to OpenAI)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {settings.openai_api_key}"})
            checks["llm"] = "ok" if r.status_code < 500 else "fail"
    except Exception:
        checks["llm"] = "fail"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(content=checks, status_code=200 if all_ok else 503)


# --- Error handler ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """application/problem+json per RFC 7807."""
    import sentry_sdk
    sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={
            "type": "about:blank",
            "title": "Internal Server Error",
            "status": 500,
            "detail": str(exc) if settings.environment == "development" else "An unexpected error occurred",
            "instance": str(request.url),
        },
        media_type="application/problem+json",
    )


# --- Middleware ---
from app.middleware.idempotency import IdempotencyMiddleware
from app.middleware.rate_limit import RateLimitMiddleware

app.add_middleware(IdempotencyMiddleware)
app.add_middleware(RateLimitMiddleware)

# --- Routers ---
from app.contexts.iam.router import router as iam_router
from app.contexts.iam.billing_router import router as billing_router
from app.contexts.profile.router import router as profile_router
from app.contexts.jobs.router import router as jobs_router
from app.contexts.conversation.router import router as conversation_router
from app.contexts.tailoring.router import router as tailoring_router
from app.contexts.apply.router import router as apply_router
from app.contexts.followup.router import router as followup_router
from app.contexts.infra.router import router as infra_router

app.include_router(iam_router)
app.include_router(billing_router)
app.include_router(profile_router)
app.include_router(jobs_router)
app.include_router(conversation_router)
app.include_router(tailoring_router)
app.include_router(apply_router)
app.include_router(followup_router)
app.include_router(infra_router)
