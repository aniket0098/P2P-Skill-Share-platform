"""Authenticated wallet/ledger and purchase intents. No unverified allocation route."""
from uuid import UUID
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel
from credits_models import CreditTransaction, CreditPurchase
from credits_service import PACKAGES, lock_wallet, renew, snapshot


class PurchaseIn(BaseModel):
    package_key: str
    client_request_id: UUID


def register_credits(app, get_db, get_current_user_model):
    @app.get("/api/credits")
    def wallet(db=Depends(get_db), user=Depends(get_current_user_model)):
        try:
            w = lock_wallet(db, user.id)
            renew(db, w)
            result = snapshot(db, w)
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise

    @app.get("/api/credits/history")
    def history(filter: str = "all", limit: int = Query(100, ge=1, le=200),
                offset: int = Query(0, ge=0), db=Depends(get_db), user=Depends(get_current_user_model)):
        mapping = {"earned": "DAILY_RENEWAL", "spent": "ROOM_CREATION", "purchased": "PURCHASE", "rewards": "REWARD"}
        if filter != "all" and filter not in mapping:
            raise HTTPException(422, "Invalid activity filter")
        q = db.query(CreditTransaction).filter_by(user_id=user.id)
        if filter != "all":
            q = q.filter_by(kind=mapping[filter])
        total = q.count()
        rows = q.order_by(CreditTransaction.id.desc()).offset(offset).limit(limit).all()
        reverse = {v: k for k, v in mapping.items()}
        return {"total": total, "activity": [{"id": r.id, "amount": r.amount, "kind": r.kind,
            "type": reverse.get(r.kind, "rewards"), "icon": "fa-solid fa-coins",
            "title": r.description, "detail": r.kind.replace("_", " "),
            "date": r.created_at.isoformat(), "room_id": r.room_id, "purchase_id": r.purchase_id,
            "daily_after": r.daily_after, "purchased_after": r.purchased_after} for r in rows]}

    @app.get("/api/credits/packages")
    def packages(user=Depends(get_current_user_model)):
        return {"packages": [{"key": k, "currency": "INR", **v} for k, v in PACKAGES.items()],
                "payment_available": False}

    @app.post("/api/credits/purchase", status_code=202)
    def purchase(data: PurchaseIn, db=Depends(get_db), user=Depends(get_current_user_model)):
        if data.package_key not in PACKAGES:
            raise HTTPException(422, "Unknown credit package")
        try:
            lock_wallet(db, user.id)
            key = f"purchase:{user.id}:{data.client_request_id}"
            row = db.query(CreditPurchase).filter_by(idempotency_key=key).first()
            if row and row.package_key != data.package_key:
                raise HTTPException(409, "Request ID was already used for another package")
            if not row:
                row = CreditPurchase(user_id=user.id, package_key=data.package_key,
                                     idempotency_key=key, **PACKAGES[data.package_key])
                db.add(row)
                db.flush()
            result = {"purchase_id": row.id, "status": row.status,
                      "payment": {"status": "not_configured"},
                      "message": "Payment integration is not available yet. No payment taken or credits allocated."}
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise
