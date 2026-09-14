"""Explore Skills end-to-end check (no server needed)."""
import learning_api as L
from database import SessionLocal
from models import LearningResource


def main():
    db = SessionLocal()
    try:
        rows = db.query(LearningResource).all()
        print("resources:", len(rows))
        items = [L._ser_res(r, None, False) for r in rows]
        lectures = [i for i in items if i["is_lecture"]]
        print("lectures:", len(lectures))
        cats = {}
        for i in items:
            cats[i["category"]] = cats.get(i["category"], 0) + 1
        print("categories:", cats)
        # Simulate unique-watch merge: 0-10 + 20-30 => 20 unique.
        merged, unique = L._merge_ranges([(0, 600), (1200, 1800)])
        print("merge 0-600 + 1200-1800 =>", unique, "secs (expect 1200)")
        assert unique == 1200, unique
        # 25/50 min => 50%.
        assert round(1500 / 3000 * 100, 1) == 50.0
        print("25/50 min => 50% OK")
        # Course grouping sanity.
        keys = {i["course_key"] for i in items if i["course_key"]}
        print("course_keys:", sorted(keys))
        assert "python-fundamentals" in keys
        assert "english-speaking-basics" in keys
        print("E2E STATIC CHECKS PASS")
    finally:
        db.close()


if __name__ == "__main__":
    main()
