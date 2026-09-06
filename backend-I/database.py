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
engine = create_engine(
    _database_url,
    pool_pre_ping=True,   # verify connections before use (avoids stale connections)
    pool_recycle=1800,    # recycle connections after 30 min (compatible with Neon/PgBouncer)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
