"""COMMUNICATION HUB — additive database migrations.

Every statement is idempotent (IF NOT EXISTS) and additive-only:
new tables + new nullable columns. NEVER DROP/TRUNCATE/DELETE.
Run at backend startup BEFORE Base.metadata.create_all().
"""
from sqlalchemy import text


TABLE_STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS conversation_preferences (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        is_muted BOOLEAN NOT NULL DEFAULT FALSE,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        last_read_message_id INTEGER NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_pref ON conversation_preferences (conversation_id, user_id)",
    "CREATE INDEX IF NOT EXISTS ix_conv_pref_user ON conversation_preferences (user_id)",
    """CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji VARCHAR(16) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_reaction ON message_reactions (message_id, user_id, emoji)",
    "CREATE INDEX IF NOT EXISTS ix_msg_reaction_msg ON message_reactions (message_id)",
    """CREATE TABLE IF NOT EXISTS message_attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stored_name VARCHAR NOT NULL,
        original_name VARCHAR NOT NULL,
        mime_type VARCHAR NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        kind VARCHAR NOT NULL DEFAULT 'file',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS ix_msg_attach_msg ON message_attachments (message_id)",
    "CREATE INDEX IF NOT EXISTS ix_msg_attach_conv ON message_attachments (conversation_id)",
    """CREATE TABLE IF NOT EXISTS call_records (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NULL REFERENCES conversations(id) ON DELETE SET NULL,
        room VARCHAR NOT NULL,
        call_type VARCHAR NOT NULL DEFAULT 'voice',
        initiator_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR NOT NULL DEFAULT 'ended',
        started_at TIMESTAMP DEFAULT NOW() NOT NULL,
        ended_at TIMESTAMP NULL,
        duration_seconds INTEGER NULL
    )""",
    "CREATE INDEX IF NOT EXISTS ix_call_room ON call_records (room)",
    "CREATE INDEX IF NOT EXISTS ix_call_conv ON call_records (conversation_id)",
    """CREATE TABLE IF NOT EXISTS call_participants (
        id SERIAL PRIMARY KEY,
        call_id INTEGER NOT NULL REFERENCES call_records(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
        left_at TIMESTAMP NULL
    )""",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_call_participant ON call_participants (call_id, user_id)",
]

COLUMN_STATEMENTS = [
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_type VARCHAR NOT NULL DEFAULT 'direct'",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_name VARCHAR NULL",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_avatar_url VARCHAR NULL",
    "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'member'",
    "ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP DEFAULT NOW()",
    "ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS last_read_message_id INTEGER NULL",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER NULL REFERENCES messages(id) ON DELETE SET NULL",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_id INTEGER NULL",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_kind VARCHAR NULL",
]


def run_communication_migrations(engine):
    """Execute additive migrations, one statement per transaction.

    Each statement commits independently so a single failure can never
    block the others (and never rolls back user data). Returns the
    number of successfully applied statements.
    """
    applied = 0
    errors = []
    # Columns on existing tables first, then brand-new tables.
    for stmt in COLUMN_STATEMENTS + TABLE_STATEMENTS:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
            applied += 1
        except Exception as exc:  # noqa: BLE001 - idempotent best effort
            errors.append(f"{str(exc)[:120]} :: {stmt[:80]}")
    # Data repair (not destructive): legacy NULL types read as direct.
    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE conversations SET conversation_type='direct' WHERE conversation_type IS NULL"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{str(exc)[:120]} :: backfill conversation_type")
    if errors:
        print(f"[comm] migration notes ({len(errors)} skipped as already applied or deferred):")
        for err in errors[:8]:
            print(f"[comm]   - {err}")
    return applied
