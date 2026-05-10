"""Sentry + OpenTelemetry initialization."""

from app.config import settings


def init_sentry():
    if not settings.sentry_dsn:
        return
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1 if settings.environment == "production" else 1.0,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
    )


def init_otel():
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import ConsoleSpanExporter, BatchSpanProcessor

        provider = TracerProvider()
        if settings.environment == "development":
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        trace.set_tracer_provider(provider)

        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        # Will be instrumented on the app instance in main.py lifespan if needed
    except ImportError:
        pass
