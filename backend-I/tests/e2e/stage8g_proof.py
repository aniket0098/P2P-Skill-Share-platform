"""Stage 8G proof runner (LOCAL-ONLY, OFFLINE, ZERO network/DB writes)."""
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stage8g_safety import check_base_guard, classify_host, new_manifest, safe_db_identity

RESULTS = []


def check(label, ok, info=""):
    RESULTS.append((label, bool(ok), str(info)[:160]))


def plan_cleanup(manifest, current_fingerprint, current_env,
                 allow_remote="", confirm="", test_base="http://127.0.0.1:8000",
                 ownership=None, existing=None):
    ownership = ownership or {}
    existing = existing or {}
    if not manifest.get("user_id"):
        return (False, "REFUSE: fixture user ID missing")
    if not manifest.get("database_fingerprint"):
        return (False, "REFUSE: database fingerprint missing")
    if manifest.get("environment") != current_env:
        return (False, "REFUSE: expected environment wrong")
    if manifest.get("database_fingerprint") != current_fingerprint:
        return (False, "REFUSE: database identity mismatch")
    ok, mode = check_base_guard(test_base, allow_remote, confirm)
    if not ok:
        return (False, "REFUSE: remote guard (%s)" % mode)
    if classify_host(urllib.parse.urlsplit(test_base).hostname or "") == "non-local":
        if os.environ.get("STAGE8H_ALLOW_PROD_CLEANUP", "") != "1":
            return (False, "REFUSE: production cleanup not enabled")
    opps = list(manifest.get("opportunity_ids") or [])
    apps = list(manifest.get("application_ids") or [])
    if not opps and not apps:
        return (False, "REFUSE: manifest holds no captured IDs")
    total = len(opps) + len(apps)
    if total != int(manifest.get("expected_deletes") or 0):
        return (False, "REFUSE: unexpected record count")
    for oid in opps + apps:
        if not isinstance(oid, int) or oid <= 0:
            return (False, "REFUSE: arbitrary/invalid ID %r" % (oid,))
        if oid not in existing or not existing.get(oid):
            return (False, "REFUSE: captured ID %s does not exist" % oid)
        if ownership.get(oid, None) != manifest.get("user_id"):
            return (False, "REFUSE: ID %s not owned by fixture" % oid)


    plan = (["DELETE /api/opportunities/%d" % o for o in opps]
            + ["POST /api/applications/%d/withdraw" % a for a in apps])
    return (True, plan)


def main():
    a = safe_db_identity("postgresql://user:placeholder@localhost:5432/skillshare_db")
    b = safe_db_identity("postgresql://user:placeholder2@localhost:5432/skillshare_db")
    check("identity deterministic for same db", a["fingerprint"] == b["fingerprint"], a["fingerprint"])
    check("identity excludes password", "placeholder" not in str(a) and "placeholder2" not in str(a))
    check("identity local env", a["environment"] == "local" and a["host_class"] == "local")
    c = safe_db_identity("postgresql://user:placeholder@database-host.example:5432/exampledb?sslmode=require")
    check("identity non-local redacted", c["database"] == "remote-redacted" and "example" not in str(c).lower().replace("exampledb","")
          and c["fingerprint"] != a["fingerprint"])
    check("sqlite local", safe_db_identity("sqlite:///./t.db")["environment"] == "local")
    check("local base allowed", check_base_guard("http://127.0.0.1:8000") == (True, "LOCAL"))
    ok, mode = check_base_guard("https://p2p-skill-share-platform.onrender.com", "", "")
    check("remote refused without opt-in", ok is False and mode == "REMOTE-REFUSED", mode)
    ok2, mode2 = check_base_guard("https://p2p-skill-share-platform.onrender.com", "1", "yes-i-know")
    check("remote allowed only with both flags", ok2 is True and "AUTHORIZED" in mode2, mode2)
    ok3, _ = check_base_guard("https://p2p-skill-share-platform.onrender.com", "1", "")
    check("remote refused on missing confirm", ok3 is False)
    check("proof env has no remote opt-in",
          os.environ.get("TEST_ALLOW_REMOTE", "") == "" and os.environ.get("TEST_CONFIRM", "") == "")
    man = new_manifest("local", a["fingerprint"])
    man["user_id"] = 4242
    man["opportunity_ids"] = [101]
    man["application_ids"] = [202]
    man["expected_deletes"] = 2
    own = {101: 4242, 202: 4242}
    exi = {101: True, 202: True}
    allowed, plan = plan_cleanup(man, a["fingerprint"], "local", ownership=own, existing=exi)
    check("positive exact-ID plan allowed", allowed is True and len(plan) == 2, str(plan)[:120])
    check("plan uses API-only calls", allowed and all(("opportunities" in p or "withdraw" in p) for p in plan))
    m0 = new_manifest("local", a["fingerprint"]); m0["expected_deletes"] = 1
    check("N1 missing user ID refuses", plan_cleanup(m0, a["fingerprint"], "local")[0] is False)
    m1 = dict(man); m1["database_fingerprint"] = ""
    check("N2 missing fingerprint refuses", plan_cleanup(m1, a["fingerprint"], "local", ownership=own, existing=exi)[0] is False)
    check("N3 wrong environment refuses", plan_cleanup(man, a["fingerprint"], "production", ownership=own, existing=exi)[0] is False)
    check("N4 missing remote guard refuses", ok is False)
    check("N5 missing confirmation refuses", ok3 is False)
    check("N6 nonexistent ID refuses",
          plan_cleanup(dict(man, opportunity_ids=[999]), a["fingerprint"], "local",
                       ownership={999: 4242, 202: 4242}, existing={999: False, 202: True})[0] is False)
    check("N7 wrong owner refuses",
          plan_cleanup(man, a["fingerprint"], "local", ownership={101: 7, 202: 4242}, existing=exi)[0] is False)
    check("N8 wrong opportunity owner refuses",
          plan_cleanup(man, a["fingerprint"], "local", ownership={101: 777, 202: 4242}, existing=exi)[0] is False)
    check("N9 wrong application owner refuses",
          plan_cleanup(man, a["fingerprint"], "local", ownership={101: 4242, 202: 888}, existing=exi)[0] is False)
    man10 = dict(man); man10["expected_deletes"] = 5
    check("N10 unexpected count refuses",
          plan_cleanup(man10, a["fingerprint"], "local", ownership=own, existing=exi)[0] is False)
    man11 = dict(man); man11["opportunity_ids"] = ["1 OR 1=1"]
    check("N11 arbitrary ID refuses",
          plan_cleanup(man11, a["fingerprint"], "local", ownership=own, existing=exi)[0] is False)
    check("N12 wrong database identity refuses",
          plan_cleanup(man, c["fingerprint"], "local", ownership=own, existing=exi)[0] is False)
    allowedR, reasonR = plan_cleanup(dict(man), a["fingerprint"], "local",
                                     allow_remote="1", confirm="yes-i-know",
                                     test_base="https://p2p-skill-share-platform.onrender.com",
                                     ownership=own, existing=exi)
    check("remote production cleanup refused without STAGE8H flag", allowedR is False, reasonR[:80])
    passed = sum(1 for _, ok_, _ in RESULTS if ok_)
    failed = [(l, i) for l, ok_, i in RESULTS if not ok_]
    print("STAGE8G PROOF: TOTAL=%d PASSED=%d FAILED=%d" % (len(RESULTS), passed, len(failed)))
    for l, i in failed:
        print("  FAIL %s -> %s" % (l, i))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
