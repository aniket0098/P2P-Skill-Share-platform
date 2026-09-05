from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import config

# The database URL always comes from the environment (.env for local dev,
# platform env vars for production / Neon). Never hardcode credentials here.
engine = create_engine(
    config.DATABASE_URL,
    pool_pre_ping=True,   # verify connections before use (avoids stale connections)
    pool_recycle=1800,    # recycle connections after 30 min (compatible with Neon/PgBouncer)
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
