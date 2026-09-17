"""PostgreSQL-authoritative credit operations; caller owns commit/rollback."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from fastapi import HTTPException
from credits_models import CreditWallet, CreditTransaction

DAILY_MAX = 1000
CREDITS_PER_MINUTE = 100
DEFAULT_ROOM_MINUTES = 10
PACKAGES = {
    "Starter": {"credits": 500, "amount_minor": 4900},
    "Popular": {"credits": 1200, "amount_minor": 9900},
    "Pro": {"credits": 3000, "amount_minor": 19900},
    "Premium": {"credits": 7000, "amount_minor": 39900},
}


def db_now(db):
    return db.scalar(select(func.clock_timestamp())).astimezone(timezone.utc)


def room_cost(minutes) -> int:
    """Proportional pricing: 100 credits per minute. Unset duration -> 10 min."""
    return int(minutes or DEFAULT_ROOM_MINUTES) * CREDITS_PER_MINUTE


def lock_wallet(db, user_id):
    # UPSERT handles simultaneous first visits; lock survives until caller commit.
    db.execute(insert(CreditWallet).values(user_id=user_id, daily_credits=0,
               purchased_credits=0).on_conflict_do_nothing(index_elements=["user_id"]))
    return db.query(CreditWallet).filter_by(user_id=user_id).populate_existing().with_for_update().one()


def ledger(db, wallet, amount, kind, description, key, **related):
    row = CreditTransaction(user_id=wallet.user_id, amount=amount, kind=kind,
        description=description, idempotency_key=key, daily_after=wallet.daily_credits,
        purchased_after=wallet.purchased_credits, **related)
    db.add(row)
    return row


def renew(db, wallet):
    today = db_now(db).date()  # evaluated AFTER taking the wallet lock
    if wallet.daily_renewed_on is None or wallet.daily_renewed_on < today:
        delta = DAILY_MAX - wallet.daily_credits
        wallet.daily_credits = DAILY_MAX
        wallet.daily_renewed_on = today
        # Ledger amount is the actual change (600 -> 1000 is +400, not +1000).
        ledger(db, wallet, delta, "DAILY_RENEWAL", "Daily credits renewed to 1,000",
               f"renewal:{wallet.user_id}:{today}")
        db.flush()


def spend(db, wallet, cost, key, request_hash):
    if wallet.daily_credits + wallet.purchased_credits < cost:
        raise HTTPException(402, f"Insufficient credits. This room costs {cost:,} credits.")
    daily = min(wallet.daily_credits, cost)
    wallet.daily_credits -= daily
    wallet.purchased_credits -= cost - daily
    return ledger(db, wallet, -cost, "ROOM_CREATION",
                  f"{cost // CREDITS_PER_MINUTE}-minute Discussion Room", key,
                  request_hash=request_hash)


def snapshot(db, wallet):
    now = db_now(db)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = db.query(CreditTransaction.kind, func.sum(CreditTransaction.amount)).filter(
        CreditTransaction.user_id == wallet.user_id, CreditTransaction.created_at >= month
    ).group_by(CreditTransaction.kind).all()
    totals = dict(rows)
    earned = int(totals.get("DAILY_RENEWAL", 0))
    spent = -int(totals.get("ROOM_CREATION", 0))
    return {"daily_credits": wallet.daily_credits, "purchased_credits": wallet.purchased_credits,
        "balance": wallet.daily_credits + wallet.purchased_credits,
        "daily_max": DAILY_MAX, "daily_renewed_on": str(wallet.daily_renewed_on),
        "next_renewal_at": (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat(),
        "server_now": now.isoformat(), "renewal_timezone": "UTC",
        "earnedThisMonth": earned, "spentThisMonth": spent,
        "purchasedThisMonth": int(totals.get("PURCHASE", 0)),
        "reviewsReceived": 0, "averageRating": 0, "review_rewards_available": False,
        "monthlyGoal": 500, "credits_per_minute": CREDITS_PER_MINUTE, "default_room_minutes": 10}
