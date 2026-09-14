"""Additive Explore Skills migration. Idempotent. Never destructive."""
from sqlalchemy import text
from database import engine

STATEMENTS = [
    "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS watched_seconds INTEGER DEFAULT 0",
    "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS last_position_seconds INTEGER DEFAULT 0",
    "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS total_duration_seconds INTEGER",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS duration_seconds INTEGER",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS media_url VARCHAR",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS course_key VARCHAR",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS course_title VARCHAR",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS lecture_order INTEGER DEFAULT 0",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS is_lecture BOOLEAN DEFAULT FALSE",
    "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS category VARCHAR",
    "CREATE TABLE IF NOT EXISTS learning_bookmarks (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, resource_id INTEGER NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT now() NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_bookmark ON learning_bookmarks (user_id, resource_id)",
    "CREATE TABLE IF NOT EXISTS learning_watch_segments (id SERIAL PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES learning_records(id) ON DELETE CASCADE, start_sec INTEGER NOT NULL DEFAULT 0, end_sec INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ix_learning_watch_segments_record ON learning_watch_segments (record_id)",
]


def main():
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
            print("OK:", stmt[:90])
    print("migration complete")


if __name__ == "__main__":
    main()
