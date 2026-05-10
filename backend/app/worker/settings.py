"""arq worker settings."""

from arq.connections import RedisSettings

from app.config import settings


def parse_redis_url(url: str) -> RedisSettings:
    """Parse redis:// URL into arq RedisSettings."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or "0"),
    )


class WorkerSettings:
    """arq worker configuration."""

    redis_settings = parse_redis_url(settings.redis_url)
    max_jobs = 10
    job_timeout = 300  # 5 min default
    max_tries = 3

    # Job functions registered below (populated by each context)
    functions: list = []
