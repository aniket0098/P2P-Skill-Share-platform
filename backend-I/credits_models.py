"""Credit accounting tables. Additive; existing users and rooms are preserved."""
from sqlalchemy import Column, Integer, BigInteger, String, Date, DateTime, ForeignKey, CheckConstraint, func
from database import Base


class CreditWallet(Base):
    __tablename__ = "credit_wallets"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    daily_credits = Column(Integer, nullable=False, default=0)
    purchased_credits = Column(BigInteger, nullable=False, default=0)
    daily_renewed_on = Column(Date, nullable=True)
    __table_args__ = (
        CheckConstraint("daily_credits BETWEEN 0 AND 1000", name="ck_wallet_daily"),
        CheckConstraint("purchased_credits >= 0", name="ck_wallet_purchased"),
    )


class CreditPurchase(Base):
    __tablename__ = "credit_purchases"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    package_key = Column(String(40), nullable=False)
    credits = Column(Integer, nullable=False)
    amount_minor = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    status = Column(String(30), nullable=False, default="payment_unavailable")
    provider = Column(String(50), nullable=True)
    provider_ref = Column(String(200), nullable=True, unique=True)
    idempotency_key = Column(String(160), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(BigInteger, nullable=False)
    kind = Column(String(40), nullable=False, index=True)
    description = Column(String(300), nullable=False)
    room_id = Column(Integer, ForeignKey("discussion_rooms.id"), nullable=True, unique=True)
    purchase_id = Column(Integer, ForeignKey("credit_purchases.id"), nullable=True, unique=True)
    daily_after = Column(Integer, nullable=False)
    purchased_after = Column(BigInteger, nullable=False)
    idempotency_key = Column(String(160), nullable=False, unique=True)
    request_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


def migrate_credits(engine):
    """Fail closed if accounting schema cannot be installed. Never rewrite old rows."""
    from sqlalchemy import text

    # Register the referenced tables (users / discussion_rooms) on the shared
    # metadata before create_all, so the foreign keys below always resolve —
    # even when this runs from a standalone script.
    import models  # noqa: F401  (users)
    import discussions_models  # noqa: F401  (discussion_rooms)

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE discussion_rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ"))
        conn.execute(text("ALTER TABLE discussion_rooms ADD COLUMN IF NOT EXISTS credit_cost INTEGER"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_discussion_expiry ON discussion_rooms (expires_at)"))
    Base.metadata.create_all(engine, tables=[CreditWallet.__table__, CreditPurchase.__table__, CreditTransaction.__table__])
