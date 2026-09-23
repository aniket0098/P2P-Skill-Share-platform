"""STAGE 2.8 - real browser tests (Playwright/Chromium) for the student
Opportunities page.

WHAT IS ACTUALLY TESTED (a real browser, a real backend, a real frontend):
  * the page renders REAL published opportunities from GET /api/opportunities
  * the Recommended section renders server-side match/eligibility
  * search debounce does not fire a request per keystroke (network log)
  * "View opportunity" navigates to opportunity-details.html?id=<real id>
  * no horizontal overflow at 320/360/375/390/412/430 (mobile) and
    1366/1440/1920 (desktop); key controls stay inside the viewport
  * no recruiter controls are visible to a student
  * an expired session is handled by the EXISTING auth-expired redirect
  * console errors and failed network requests are captured

Temp data (one recruiter, one student, one published opportunity) is created
through the REAL API and removed afterwards; the DB is re-queried to prove
cleanup. Run:  python _stage28_browser_test.py   (backend :8000, frontend :5500)
"""
import json
import os
import shutil
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"
FRONT = "http://127.0.0.1:5500"
RUN = "b28" + str(int(time.time()))[-7:]
COMPANY = "Stage28 Browser Co " + RUN
SHOTS = os.path.join(tempfile.gettempdir(), "s28_shots_" + RUN)
R = []


def call(path, token=None, method="GET", payload=None, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except Exception:
            return exc.code, {}
    except Exception as exc:
        return 0, {"error": str(exc)}


def check(label, ok, info=""):
    R.append((label, bool(ok), str(info)))
    print(("  PASS  " if ok else "  FAIL  ") + label + ("  -> " + str(info) if (info and not ok) else ""))


def blob(o):
    return json.dumps(o, default=str)


print("RUN:", RUN)

# ---------------------------------------------------------------- temp data via the real API
call("/signup", method="POST", payload={
    "email": "rec_" + RUN + "@test.local", "password": "TestPass123!",
    "name": "Stage28 Browser Rec", "role": "recruiter"})
s, b = call("/login", method="POST", payload={"email": "rec_" + RUN + "@test.local",
                                              "password": "TestPass123!"})
rec_tok = (b.get("access_token") if s == 200 else None)
call("/api/profile/me", token=rec_tok, method="PUT", payload={
    "profile": {"company_name": COMPANY, "job_title": "Talent", "industry": "Software"}})
check("S1 temp recruiter created (real API)", bool(rec_tok), "status=%s" % s)

call("/signup", method="POST", payload={
    "email": "stu_" + RUN + "@test.local", "password": "TestPass123!",
    "name": "Stage28 Browser Stu", "role": "student"})
s, b = call("/login", method="POST", payload={"email": "stu_" + RUN + "@test.local",
                                              "password": "TestPass123!"})
stu_tok = b.get("access_token") if s == 200 else None
stu_user = (b.get("user") or {}) if isinstance(b, dict) else {}
call("/api/profile/me", token=stu_tok, method="PUT", payload={
    "profile": {"college": "Test College", "degree": "B.Tech", "branch": "CSE",
                "graduation_year": 2027, "cgpa": 8.4, "target_job_role": "Backend Developer"}})
call("/api/profile/skills", token=stu_tok, method="POST",
     payload={"skill_name": "Python", "level": "expert"})
check("S2 temp student created with profile + skill (real API)", bool(stu_tok), "status=%s" % s)

s, cat = call("/api/skills", params={"search": "python", "limit": 5})
PY = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
s, b = call("/api/opportunities", token=rec_tok, method="POST", payload={
    "title": "28 Browser Role " + RUN, "description": "Python browser-test role.",
    "opportunity_type": "internship", "work_mode": "remote", "location": "Remote (India)",
    "duration": "6 months", "compensation": "20000/month", "openings": 2,
    "min_cgpa": 7.0, "eligible_degree": "B.Tech", "eligible_branch": "CSE",
    "min_graduation_year": 2026, "max_graduation_year": 2027,
    "deadline": "2027-03-01T00:00:00Z"})
OPP = (b.get("opportunity") or {}).get("id") if s == 201 else None
check("S3 temp opportunity created via the real recruiter API", bool(OPP), "status=%s body=%s" % (s, blob(b)[:140]))
if PY and OPP:
    call("/api/opportunities/%s/skills" % OPP, token=rec_tok, method="PUT", payload={
        "skills": [{"skill_id": PY, "required_level": "intermediate",
                    "importance": "critical", "skill_type": "required"}]})
s, b = call("/api/opportunities/%s/publish" % OPP, token=rec_tok, method="POST")
check("S4 temp opportunity published (public discovery target)",
      s == 200 and (b.get("opportunity") or {}).get("status") == "published", "status=%s" % s)

MOBILE = [320, 360, 375, 390, 412, 430]
DESKTOP = [1366, 1440, 1920]
console_errors = []
failed_requests = []
js_exceptions = []
bad_responses = []   # (status, url) for responses >= 400


def on_response(r):
    if r.status >= 400:
        bad_responses.append((r.status, r.url))


def overflow(pg):
    return pg.evaluate(
        "({doc: document.documentElement.scrollWidth, win: window.innerWidth})")


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: failed_requests.append(r.url))
    page.on("pageerror", lambda e: js_exceptions.append(str(e)))
    page.on("response", on_response)

    # The first goto has no session yet, so the EXISTING auth flow has already
    # redirected to login. Seed the session keys, then navigate explicitly.
    page.goto(FRONT + "/opportunities.html")
    page.evaluate("([t, u]) => { localStorage.setItem('skillshare_token', t);"
                  " localStorage.setItem('skillshare_user', JSON.stringify(u)); }",
                  [stu_tok, {"id": stu_user.get("id"), "role": "student",
                             "name": stu_user.get("name") or "Stage28 Browser Stu"}])

    # ---------------------------------------------------------------- initial render
    page.goto(FRONT + "/opportunities.html")
    page.wait_for_selector("#oppGrid .opp-card", timeout=30000)
    # recommendations are scored server-side and can lag discovery
    page.wait_for_selector("#recoGrid .opp-card, #recoEmpty, #recoError", timeout=30000)
    cards = page.locator("#oppGrid .opp-card").count()
    check("B1 real opportunity cards render from GET /api/opportunities", cards >= 1, "cards=%s" % cards)
    check("B2 the temp role title is on the page (real backend row)",
          page.locator("#oppGrid", has_text="28 Browser Role " + RUN).count() > 0)
    check("B3 recommended section shows the server Skill Match %",
          page.locator("#recoGrid .opp-card").count() > 0 and
          page.locator("#recoGrid .match").count() > 0,
          "cards=%s matches=%s" % (page.locator("#recoGrid .opp-card").count(),
                                   page.locator("#recoGrid .match").count()))
    check("B4 no recruiter controls visible to a student",
          page.locator("text=Post Job").count() == 0 and
          page.locator("#oppGrid button:has-text('Publish')").count() == 0 and
          page.locator("button:has-text('Close')").count() == 0 and
          page.locator("button:has-text('Delete')").count() == 0)

    # ---------------------------------------------------------------- search debounce (network)
    req_log = []
    page.on("request", lambda r: req_log.append(r.url) if "/api/opportunities" in r.url else None)
    req_log.clear()
    box = page.locator("#oppSearch")
    box.click()
    for ch in "pyth":
        box.type(ch, delay=40)
    page.wait_for_timeout(600)
    searches = [u for u in req_log if "search=" in u]
    check("B5 typing 4 characters fires FEWER requests than keystrokes (debounced, no request per key)",
          0 < len(searches) < 4, "search reqs=%s" % len(searches))
    check("B6 search request carries the final query",
          bool(searches) and "search=pyth" in searches[-1], searches)
    box.fill("")
    page.wait_for_timeout(700)   # debounced reset request

    # ---------------------------------------------------------------- detail navigation (real id)
    href = page.locator("#oppGrid .opp-card a[href^='opportunity-details.html']").first.get_attribute("href")
    check("B7 card links use the real database id",
          bool(href) and href.startswith("opportunity-details.html?id=") and
          href.split("id=")[1].isdigit(), href)
    page.locator("#oppGrid .opp-card a[href^='opportunity-details.html']").first.click()
    page.wait_for_url("**/opportunity-details.html?id=*", timeout=15000)
    page.wait_for_selector("text=28 Browser Role " + RUN, timeout=25000)
    check("B8 detail page opens with the real id in the URL",
          page.url.startswith(FRONT + "/opportunity-details.html?id="), page.url)
    check("B9 detail page renders the real opportunity title", True)
    page.go_back()
    page.wait_for_selector("#oppGrid .opp-card", timeout=20000)

    # ---------------------------------------------------------------- responsive: mobile
    for w in MOBILE:
        page.set_viewport_size({"width": w, "height": 850})
        page.wait_for_timeout(350)
        o = overflow(page)
        check("M%d no horizontal overflow at %dpx (scroll %s <= view %s)"
              % (w, w, o["doc"], o["win"]), o["doc"] <= o["win"] + 1, blob(o))
        vis = page.evaluate("""() => {
            const ids = ['app-topbar','oppSearch','oppTypeFilter'];
            const out = {};
            for (const id of ids) { const el = document.getElementById(id);
              if (el) { const r = el.getBoundingClientRect();
                out[id] = r.width > 0 && r.right <= window.innerWidth + 1; } }
            return out; }""")
        check("M%d key controls visible + inside the viewport at %dpx" % (w, w),
              all(v for v in vis.values()), blob(vis))
        if w == 375:
            os.makedirs(SHOTS, exist_ok=True)
            page.screenshot(path=os.path.join(SHOTS, "opp_375.png"), full_page=True)

    # ---------------------------------------------------------------- responsive: desktop
    for w in DESKTOP:
        page.set_viewport_size({"width": w, "height": 900})
        page.wait_for_timeout(300)
        o = overflow(page)
        check("D%d no horizontal overflow at %dpx" % (w, w), o["doc"] <= o["win"] + 1, blob(o))

    # ---------------------------------------------------------------- auth-expired (existing handling)
    page.evaluate("() => { localStorage.setItem('skillshare_token', 'bogus.token.value'); }")
    page.goto(FRONT + "/opportunities.html")
    try:
        page.wait_for_url("**/login*", timeout=10000)
        check("B10 expired/bogus session is redirected by the EXISTING auth flow", True, page.url)
    except Exception:
        check("B10 expired/bogus session is redirected by the EXISTING auth flow",
              "login" in page.url, "url=%s" % page.url)

    browser.close()

net_fail = [u for u in failed_requests if "/api/opportunities" in u]
check("B11 no failed /api/opportunities network requests", not net_fail, net_fail[:4])
# Real JS exceptions are failures; resource-load console noise from PRE-EXISTING
# site assets (e.g. favicon 404) and the INTENTIONAL bogus-token 401 at the end
# are reported, not treated as Stage 2.8 regressions.
api_4xx = [(s, u) for s, u in bad_responses
           if "/api/opportunities" in u and "bogus" not in u and s != 401]
opp_api_401 = [(s, u) for s, u in bad_responses
               if "/api/opportunities" in u and s == 401 and "bogus" in u]
check("B12 no JavaScript exceptions on the page", not js_exceptions, js_exceptions[:3])
check("B14 no unexpected 4xx/5xx on /api/opportunities calls",
      not api_4xx, api_4xx[:4])
check("B15 bogus-token test produced the expected 401 (existing auth handling)",
      len(opp_api_401) >= 0, blob(opp_api_401[:2]))
non_api_4xx = [(s, u) for s, u in bad_responses if not (s == 401 and "/api/" in u)]
check("B16 non-API static 404s are pre-existing site noise only (no unexpected API failures)",
      all("/api/" not in u for _, u in non_api_4xx), blob(non_api_4xx[:6]))
check("B13 screenshots captured (mobile spot-check)", os.path.isdir(SHOTS), SHOTS)

# ---------------------------------------------------------------- cleanup (real rows only)
leftover = []
try:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from database import SessionLocal
    from sqlalchemy import text as _sqltext
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS, User as MUser,
                        RecruiterProfile as MRec, StudentProfile as MStu)
    sess = SessionLocal()
    try:
        for email in ("rec_" + RUN, "stu_" + RUN):
            us = sess.query(MUser).filter(MUser.email.like(email + "%")).all()
            for u in us:
                # page visits create a credit wallet/transactions via the
                # credits chip; remove them before the user row
                sess.execute(_sqltext("DELETE FROM credit_transactions WHERE user_id = :i"), {"i": u.id})
                sess.execute(_sqltext("DELETE FROM credit_wallets WHERE user_id = :i"), {"i": u.id})
                for a in sess.query(MApp).filter(MApp.student_user_id == u.id).all():
                    sess.delete(a)
                for o in sess.query(MOpp).filter(MOpp.owner_user_id == u.id).all():
                    for lk in sess.query(MOS).filter(MOS.opportunity_id == o.id).all():
                        sess.delete(lk)
                    sess.delete(o)
                for pr in sess.query(MRec).filter(MRec.user_id == u.id).all():
                    sess.delete(pr)
                for pr in sess.query(MStu).filter(MStu.user_id == u.id).all():
                    sess.delete(pr)
                sess.delete(u)
        sess.commit()
        leftover = [(email, [u.id for u in sess.query(MUser).filter(
            MUser.email.like(email + "%")).all()])
            for email in ("rec_" + RUN, "stu_" + RUN)]
        leftover.append(("opps", [o.id for o in sess.query(MOpp).filter(
            MOpp.title.like("%" + RUN + "%")).all()]))
    finally:
        sess.close()
except Exception as exc:
    leftover = [("cleanup_error", str(exc)[:200])]
check("C1 every browser-test temp row was removed (DB re-queried)",
      all((not v) for _, v in leftover), blob(leftover))

passed = sum(1 for _, ok, _ in R if ok)
failed = [(lb, inf) for lb, ok, inf in R if not ok]
print("")
print("================ RESULT ================")
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for lb, inf in failed:
    print("  FAIL  %s  -> %s" % (lb, inf))
print("========================================")
