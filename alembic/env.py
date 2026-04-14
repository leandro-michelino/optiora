"""Alembic environment configuration for OptiOra."""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make sure the finops_mcp package is importable when running alembic from the
# repo root (e.g. `alembic upgrade head`).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import the SQLAlchemy metadata and the resolved DATABASE_URL from the ORM
# module so that autogenerate and migrations always target the same schema.
from finops_mcp.orm_models import Base, DATABASE_URL  # noqa: E402

# Alembic Config object, giving access to values in alembic.ini.
config = context.config

# Override sqlalchemy.url with the runtime-resolved DATABASE_URL so that
# environment variables (DATABASE_URL / OCI_DB_*) are respected.
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Interpret the config file for Python logging — this line sets up loggers.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata object for autogenerate support.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine, avoiding
    the need for a DBAPI to be available.  Calls to context.execute() here
    emit the given string to the script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an Engine and associates a connection with the context.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
