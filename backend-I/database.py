from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import config

# SSL safety net: managed Postgres (Neon) always requires TLS. If the
# DATABASE_URL came from the environment without an explicit sslmode,
# add it here — local (localhost/127.0.0.1) URLs are left untouched.
_database_url = config.DATABASE_URL
if (
    "sslmode=" not in _database_url
    and "localhost" not in _database_url
    and "127.0.0.1" not in _database_url
):
    _database_url += ("&" if "?" in _database_url else "?") + "sslmode=require"

# The database URL always comes from the environment (.env for local dev,
# platform env vars for production / Neon). Never hardcode credentials here.
# An unreachable endpoint (Neon waking up, network blip, outage) must never
# block a request or the startup thread indefinitely, so the TCP/login phase
# of every new connection is bounded. PostgreSQL URLs only - SQLite URLs used
# by local test scripts keep working unchanged. The pool itself keeps the
# SQLAlchemy defaults (pool_size 5 + max_overflow 10 = at most 15 connections
# for a single Render instance, far below Neon's connection limits).
_connect_args = {}
if _database_url.startswith(("postgresql://", "postgres://")):
    _connect_args["connect_timeout"] = 10

engine = create_engine(
    _database_url,
    pool_pre_ping=True,   # verify connections before use (avoids stale connections)
    pool_recycle=1800,    # recycle connections after 30 min (compatible with Neon/PgBouncer)
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
