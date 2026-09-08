import sys
try:
    from sqlalchemy import text
    from database import SessionLocal
    with SessionLocal() as db:
        count = db.execute(text("SELECT COUNT(*) FROM learning_resources")).scalar()
        rows = db.execute(text("SELECT id, title, provider, resource_type, skill, difficulty FROM learning_resources ORDER BY id LIMIT 10")).fetchall()
        with open("_db_resources.txt", "w") as f:
            f.write(f"Total learning_resources: {count}\n\n")
            for r in rows:
                f.write(f"id={r[0]} | {r[1]} | provider={r[2]} | type={r[3]} | skill={r[4]} | difficulty={r[5]}\n")
        print(f"wrote _db_resources.txt (count={count})")
except Exception as e:
    with open("_db_resources.txt", "w") as f:
        f.write("ERROR: " + str(e) + "\n")
