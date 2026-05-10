"""Application settings — pydantic-settings strict mode."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Environment
    environment: str = "development"

    # Database
    database_url: str = "postgresql+asyncpg://findwith:findwith_dev@localhost:5432/findwith"
    database_url_sync: str = "postgresql://findwith:findwith_dev@localhost:5432/findwith"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # S3 / Minio
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "findwith"
    s3_secret_key: str = "findwith_dev"
    s3_bucket: str = "findwith-dev"

    # LLM
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Clerk
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""

    # Sentry
    sentry_dsn: str = ""

    # Encryption (field-level, §12.1)
    dek_ciphertext: str = ""  # base64 AES-256 encrypted DEK
    kek: str = ""  # base64 KEK for envelope encryption

    # CORS
    cors_origins: list[str] = [
        "chrome-extension://*",
        "https://findwith.com",
        "http://localhost:3000",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
