/* =====================================================================
   STAGE 3.3 — avatar upload / boundary-pencil test suite (jsdom, offline,
   no network, no DB writes). Drives profile.html + profile.js +
   components/avatar-upload.js + components/profile-dropdown.js against a
   call-recording stub API. Fixture = a REAL captured own-profile summary
   (tests/dom/profile_own_summary.json).

   Run:  node tests/dom/stage33_avatar_upload.js   (from backend-I/)
   ===================================================================== */
"use strict";
const fs = require("fs");
const { JSDOM } = require("jsdom");
const ROOT = "C:/project p2p/peer to peer skill share/";

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
    if (cond) { pass++; console.log("  PASS  " + name); }
    else { fail++; failures.push(name); console.log("  FAIL  " + name + (extra ? "   -> " + extra : "")); }
}
function eq(got, want, name) {
    ok(got === want, name, "got " + JSON.stringify(got) + " want " + JSON.stringify(want));
}
function section(t) { console.log("\n=== " + t + " ==="); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms || 30)); }
let currentDoc = null; /* profile page under test (tests run sequentially) */
function $(id) { return currentDoc ? currentDoc.getElementById(id) : null; }
function click(window, el) {
    return el.dispatchEvent(new window.MouseEvent("click",
        { bubbles: true, cancelable: true }));
}
function supplyFile(window, input, file) {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
}
function pngFile(window) {
    return new window.File(["fake-png-bytes"], "me.png", { type: "image/png" });
}
function gifFile(window) {
    return new window.File(["gif"], "bad.gif", { type: "image/gif" });
}
function updateCalls(calls) {
    return calls.filter((c) => c[0] === "updateProfile");
}

const FIXTURE = JSON.parse(
    fs.readFileSync(__dirname + "/profile_own_summary.json", "utf8")
        .replace(/^\uFEFF/, ""));

/* ---------------- stub API (records every call) ---------------- */
function makeApi(opts, calls, events) {
    opts = opts || {};
    const base = {
        id: 626, public_id: "SC-ZERKF9", username: null, name: "Fixture User",
        email: "pf_fixture_s33@test.local", role: "student", phone: null,
        account_status: "active", bio: null, skills: null, interests: null,
        avatar_url: null, location: null, website: null, avatar: null
    };
    let sessionUser = Object.assign({}, base, opts.sessionUser || {});
    return {
        getToken: () => "test-token",
        getUser: () => sessionUser,
        setSession: (token, user) => {
            calls.push(["setSession", user]);
            if (user) sessionUser = user;
        },
        clearSession: () => { calls.push(["clearSession"]); },
        getProfileSummary: () => {
            calls.push(["summary"]);
            /* fresh clone per call: profile.js mutates the payload it is
               given, which must never leak into the shared fixture */
            return Promise.resolve(
                JSON.parse(JSON.stringify(opts.payload || FIXTURE)));
        },
        getPublicProfileSummary: () => {
            calls.push(["publicSummary"]);
            return Promise.resolve(
                JSON.parse(JSON.stringify(opts.payload || FIXTURE)));
        },
        updateMyProfile: (body) => {
            calls.push(["updateProfile", body]);
            if (opts.updateError) return Promise.reject(opts.updateError);
            if (body && Object.prototype.hasOwnProperty.call(body, "avatar_url")) {
                sessionUser = Object.assign({}, sessionUser,
                                             { avatar_url: body.avatar_url });
            }
            return Promise.resolve({ success: true,
                                     user: Object.assign({}, sessionUser) });
        },
        updateMyRoleProfile: (body) => {
            calls.push(["updateRole", body]);
            return Promise.resolve({ success: true });
        },
        _sessionUser: () => sessionUser
    };
}

/* ---------------- profile page harness ---------------- */
function profilePage(opts) {
    opts = opts || {};
    const calls = [];
    const events = [];
    const consoleErrors = [];
    const api = makeApi(opts, calls, events);
    const html = fs.readFileSync(ROOT + "profile.html", "utf8");
    const profileJs = fs.readFileSync(ROOT + "profile.js", "utf8");
    const uploadJs = fs.readFileSync(ROOT + "components/avatar-upload.js", "utf8");
    const dom = new JSDOM(html, {
        url: "http://localhost/profile.html",
        runScripts: "outside-only",
        beforeParse(window) {
            window.SkillShareAPI = api;
            window.matchMedia = () => ({
                matches: false, addEventListener() {}, removeEventListener() {}
            });
            window.addEventListener("error",
                (e) => consoleErrors.push(String(e.message || e)));
            window.addEventListener("skillshare:avatar-updated",
                (e) => events.push(e.detail || {}));
            try { window.eval(uploadJs); }
            catch (e) { consoleErrors.push("eval upload: " + e.message); }
            try { window.eval(profileJs); }
            catch (e) { consoleErrors.push("eval profile: " + e.message); }
        }
    });
    currentDoc = dom.window.document;
    return { dom, window: dom.window, doc: dom.window.document,
             calls, events, consoleErrors, api };
}
function fireReady(p) {
    p.window.document.dispatchEvent(
        new p.window.Event("DOMContentLoaded", { bubbles: true }));
}

/* ---------------- navbar dropdown harness ---------------- */
function dropdownPage(opts) {
    opts = opts || {};
    const calls = [];
    const events = [];
    const consoleErrors = [];
    const api = makeApi(opts, calls, events);
    const html = "<!DOCTYPE html><html><body>" +
        "<div id=\"profileDropdownContainer\"></div></body></html>";
    const dropdownJs = fs.readFileSync(
        ROOT + "components/profile-dropdown.js", "utf8");
    const uploadJs = fs.readFileSync(
        ROOT + "components/avatar-upload.js", "utf8");
    const dom = new JSDOM(html, {
        url: "http://localhost/dashboard.html",
        runScripts: "outside-only",
        beforeParse(window) {
            window.SkillShareAPI = api;
            window.addEventListener("error",
                (e) => consoleErrors.push(String(e.message || e)));
            window.addEventListener("skillshare:avatar-updated",
                (e) => events.push(e.detail || {}));
            try { window.eval(uploadJs); }
            catch (e) { consoleErrors.push("eval upload: " + e.message); }
            try { window.eval(dropdownJs); }
            catch (e) { consoleErrors.push("eval dropdown: " + e.message); }
        }
    });
    return { dom, window: dom.window, doc: dom.window.document,
             calls, events, consoleErrors, api };
}

/* ---------------- A. boot: corner identity + pencil visibility --------- */
async function testBootCorner() {
    section("A. boot renders corner identity + pencils");
    const p = profilePage({});
    fireReady(p);
    await flush(40);

    eq($("topNavName").textContent, "Fixture", "A1 corner shows first name");
    eq($("topNavAvatar").textContent, "FU",
       "A2 corner shows initials (no photo yet)");
    ok(!$("topNavAvatarEdit").hidden, "A3 corner pencil visible after boot");
    ok(!$("heroAvatarEdit").hidden, "A4 hero pencil visible on own profile");
    eq($("heroName").textContent, "Fixture User", "A5 hero name from payload");
    ok(!p.consoleErrors.length, "A6 no console errors",
       p.consoleErrors.join("; "));

    /* Corner pencil must NOT trigger its parent <a> navigation. */
    const notCancelled = click(p.window, $("topNavAvatarEdit"));
    ok(notCancelled === false,
       "A7 corner pencil click preventDefaults (no navigation)");
    const input = p.doc.querySelector("[data-ss-avatar-input]");
    ok(!!input, "A8 picker input created on pencil click");
    if (input) input.remove();
    p.dom.window.close();
}

/* ---------------- B. hero pencil -> gallery -> save -------------------- */
async function testUploadHappyPath() {
    section("B. hero pencil -> gallery -> save -> all circles repaint");
    const p = profilePage({});
    fireReady(p);
    await flush(40);

    click(p.window, $("heroAvatarEdit"));
    const input = p.doc.querySelector("[data-ss-avatar-input]");
    ok(!!input, "B1 hidden file input created");
    supplyFile(p.window, input, pngFile(p.window));
    await flush(60);

    const ups = updateCalls(p.calls);
    eq(ups.length, 1, "B2 exactly one updateMyProfile call");
    const av = ups.length ? ups[0][1].avatar_url : "";
    ok(typeof av === "string" && av.indexOf("data:image") === 0,
       "B3 avatar_url is a data URL", String(av).slice(0, 40));

    const sets = p.calls.filter((c) => c[0] === "setSession");
    ok(sets.some((c) => c[1] &&
                  String(c[1].avatar_url || "").indexOf("data:image") === 0),
       "B4 stored session user refreshed with the photo");

    ok(p.events.some((e) =>
        String(e.avatar_url || "").indexOf("data:image") === 0),
       "B5 skillshare:avatar-updated fired");

    ok(!!$("heroAvatar").querySelector("img"),
       "B6 hero circle now shows the photo");
    ok(!!$("topNavAvatar").querySelector("img"),
       "B7 corner circle now shows the photo");
    eq($("topNavName").textContent, "Fixture", "B8 corner name unchanged");

    const toast = $("pfToast");
    ok(toast && !toast.hidden &&
       toast.textContent.indexOf("Profile photo updated.") === 0,
       "B9 success toast shown", toast ? toast.textContent : "no toast");
    ok(!p.doc.querySelector("[data-ss-avatar-input]"),
       "B10 hidden input cleaned up after save");
    ok(!p.consoleErrors.length, "B11 no console errors",
       p.consoleErrors.join("; "));
    p.dom.window.close();
}

/* ---------------- C. validation rejects a non-image file --------------- */
async function testBadFileType() {
    section("C. validation rejects a non-image file");
    const p = profilePage({});
    fireReady(p);
    await flush(40);

    click(p.window, $("topNavAvatarEdit"));
    const input = p.doc.querySelector("[data-ss-avatar-input]");
    ok(!!input, "C1 picker opened from the corner pencil");
    supplyFile(p.window, input, gifFile(p.window));
    await flush(50);

    eq(updateCalls(p.calls).length, 0,
       "C2 no save attempted for a .gif");
    const toast = $("pfToast");
    ok(toast && !toast.hidden &&
       toast.textContent.indexOf("Use a JPG, PNG or WebP image.") === 0,
       "C3 friendly validation toast", toast ? toast.textContent : "none");
    ok(!p.doc.querySelector("[data-ss-avatar-input]"),
       "C4 input cleaned up after rejection");
    ok(!p.consoleErrors.length, "C5 no console errors",
       p.consoleErrors.join("; "));
    p.dom.window.close();
}

/* ---------------- D. edit modal cannot wipe an uploaded photo ---------- */
async function testEditModalGuard() {
    section("D. edit modal cannot wipe an uploaded (data-URL) photo");
    const p = profilePage({});
    fireReady(p);
    await flush(40);

    click(p.window, $("heroAvatarEdit"));
    supplyFile(p.window, p.doc.querySelector("[data-ss-avatar-input]"),
               pngFile(p.window));
    await flush(60);
    eq(updateCalls(p.calls).length, 1, "D1 upload saved first");

    click(p.window, $("editProfileBtn"));
    await flush(20);
    ok(!$("editProfileModal").hidden, "D2 edit modal open");
    const ef = $("efAvatar");
    ok(ef.readOnly, "D3 avatar URL field read-only for data-URL photos");
    ok(ef.hasAttribute("data-avatar-data"), "D4 marker attribute set");
    eq(ef.value, "", "D5 field does not expose the giant data URL");

    click(p.window, $("editProfileSave"));
    await flush(80);
    const ups = updateCalls(p.calls);
    eq(ups.length, 2, "D6 second updateMyProfile from modal save");
    const body = ups.length ? ups[1][1] : {};
    ok(!Object.prototype.hasOwnProperty.call(body, "avatar_url"),
       "D7 avatar_url omitted -> uploaded photo preserved",
       JSON.stringify(body).slice(0, 120));
    ok(p.calls.some((c) => c[0] === "updateRole"),
       "D8 role profile still saved");
    ok($("editProfileModal").hidden, "D9 modal closed after save");
    ok(!p.consoleErrors.length, "D10 no console errors",
       p.consoleErrors.join("; "));
    p.dom.window.close();
}

/* ---------------- E. URL field still works without an upload ----------- */
async function testModalUrlStillWorks() {
    section("E. without an uploaded photo the URL field behaves as before");
    const p = profilePage({});
    fireReady(p);
    await flush(40);

    click(p.window, $("editProfileBtn"));
    await flush(20);
    const ef = $("efAvatar");
    ok(!ef.readOnly, "E1 URL field editable when no data-URL photo");
    ok(!ef.hasAttribute("data-avatar-data"), "E2 no marker set");
    ef.value = "https://example.com/me.png";
    click(p.window, $("editProfileSave"));
    await flush(80);
    const ups = updateCalls(p.calls);
    eq(ups.length, 1, "E3 one save from the modal");
    const body = ups.length ? ups[0][1] : {};
    eq(body.avatar_url, "https://example.com/me.png",
       "E4 avatar_url sent from the field (historical behaviour)");
    p.dom.window.close();
}

/* ---------------- F. navbar circle pencil (shared component) ----------- */
async function testNavbarPencil() {
    section("F. navbar circle pencil (shared dropdown component)");
    const p = dropdownPage({});
    await p.window.SkillShareProfileDropdown.init("#profileDropdownContainer");
    await flush(20);
    const doc = p.doc;

    ok(!!doc.querySelector(".avatar-edit"), "F1 pencil badge rendered");
    eq(doc.querySelector(".avatar").textContent.trim(), "FU",
       "F2 circle shows initials before upload");

    click(p.window, doc.querySelector(".avatar-edit"));
    const input = doc.querySelector("[data-ss-avatar-input]");
    ok(!!input, "F3 picker opened from navbar pencil");
    supplyFile(p.window, input, pngFile(p.window));
    await flush(60);
    eq(updateCalls(p.calls).length, 1, "F4 one save from the navbar");
    ok(!!doc.querySelector(".avatar img"),
       "F5 circle re-rendered with the photo");
    eq(doc.getElementById("profileBtn").getAttribute("aria-expanded"),
       "false", "F6 dropdown did NOT toggle from the pencil");

    /* Photo changed on the profile page -> this circle repaints too. */
    p.window.dispatchEvent(new p.window.CustomEvent(
        "skillshare:avatar-updated",
        { detail: { avatar_url: "data:image/jpeg;base64,ZZZ" } }));
    await flush(10);
    const img = doc.querySelector(".avatar img");
    ok(img && img.getAttribute("src") === "data:image/jpeg;base64,ZZZ",
       "F7 external avatar-updated event repaints the circle");
    ok(!p.consoleErrors.length, "F8 no console errors",
       p.consoleErrors.join("; "));
    p.dom.window.close();
}

/* ---------------- runner ------------------------------------------------ */
async function main() {
    try {
        await testBootCorner();
        await testUploadHappyPath();
        await testBadFileType();
        await testEditModalGuard();
        await testModalUrlStillWorks();
        await testNavbarPencil();
    } catch (e) {
        fail++;
        failures.push("unhandled exception: " + ((e && e.stack) || e));
        console.log("  FAIL  unhandled exception -> " + ((e && e.message) || e));
    }
    console.log("\n===== STAGE 3.3 AVATAR UPLOAD — dom SUMMARY =====");
    console.log("total=" + (pass + fail) +
                "  passed=" + pass + "  failed=" + fail);
    failures.forEach((f) => console.log("  FAIL: " + f));
    console.log("Expected: 100% green.");
    process.exit(fail ? 1 : 0);
}
main();



