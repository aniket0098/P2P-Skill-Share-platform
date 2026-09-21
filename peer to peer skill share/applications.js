/* =========================================================
   SKILLSHARE — STUDENT APPLICATIONS (Stage 2.5C)
   Wires the EXISTING applications.html student view to the
   real backend:

     * GET  /api/applications/me              (JWT student only)
     * POST /api/applications/{id}/withdraw   (owner, applied->withdrawn)

   - Identity is resolved from the JWT by api-client.js; no
     student/user ids are ever sent or stored by this page.
   - Design/layout preserved: same .row-item cards, badges,
     pipeline strip, sidebar/topbar, Credits chip, tabs and
     mobile behaviour. The recruiter funnel placeholder is
     untouched; for the recruiter role view no backend call
     is made this stage.
   - Backend is authoritative: the pipeline/form card totals,
     row statuses and counts all come from the server. No mock
     rows, no placeholder fallback on error.
   ========================================================= */
(function () {
    "use strict";

    var API = window.SkillShareAPI;

    /* ---------------- small helpers ---------------- */

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function clean(v) { return v == null ? "" : String(v).trim(); }

    function truncate(s, n) {
        s = String(s || "");
        return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
    }

    /* Escape for use inside a [data-app-id="…"] CSS selector. */
    function sel(v) {
        return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function fmtDate(iso) {
        if (!iso) return "recently";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "recently";
        var diff = Date.now() - d.getTime();
        if (diff < 0) return "recently";
        var day = 86400000;
        if (diff < day) return "today";
        if (diff < 2 * day) return "yesterday";
        var days = Math.floor(diff / day);
        if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
        try {
            return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
        } catch (e) {
            return d.toISOString().slice(0, 10);
        }
    }

    function prettyStatus(s) {
        s = clean(s).replace(/_/g, " ");
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
    }

    function toast(msg) {
        if (window.portalToast) { window.portalToast(msg); return; }
        var root = $("toast-root");
        if (!root) return;
        var t = document.createElement("div");
        t.className = "toast success";
        t.setAttribute("role", "status");
        t.textContent = msg;
        root.appendChild(t);
        setTimeout(function () { t.remove(); }, 2600);
    }

    function errorMessage(error) {
        if (window.SkillShareAuth) return window.SkillShareAuth.getErrorMessage(error);
        return (error && (error.detail || error.message)) || "Something went wrong. Please try again.";
    }

    /* ---------------- constants ---------------- */

    /* Real backend statuses. Legacy "under_review" is read-only —
       shown as "Reviewing", never written or filtered for. */
    var STATUS_META = {
        applied:      { label: "Applied",     badge: "blue" },
        reviewing:    { label: "Reviewing",   badge: "blue" },
        under_review: { label: "Reviewing",   badge: "blue" },
        shortlisted:  { label: "Shortlisted", badge: "purple" },
        interview:    { label: "Interview",   badge: "amber" },
        selected:     { label: "Selected",    badge: "green" },
        rejected:     { label: "Rejected",    badge: "red" },
        withdrawn:    { label: "Withdrawn",   badge: "grey" }
    };

    /* Pipeline strip stages that have a backend status. Assessment,
       Offer and Joined have no backend status and stay at 0. */
    var PIPE_COUNTS = {
        applied: "pipeApplied",
        reviewing: "pipeReviewing",
        shortlisted: "pipeShortlisted",
        interview: "pipeInterview",
        selected: "pipeSelected"
    };

    var state = {
        view: "student",
        status: "",      // "" = All; otherwise a backend status
        limit: 20,       // backend default; offset is a row offset
        offset: 0,
        total: 0,
        hasMore: false,
        rows: [],
        loading: false,
        withdrawingId: null,      // withdraw request in flight
        pendingConfirmId: null,   // inline confirm currently open
        booted: false
    };

    /* ---------------- boot ---------------- */

    function currentView() {
        var q = null;
        try { q = new URLSearchParams(window.location.search).get("role"); } catch (e) {}
        if (!q) { try { q = localStorage.getItem("skillshare_portal_role"); } catch (e2) {} }
        return q === "recruiter" ? "recruiter" : "student";
    }

    async function boot() {
        if (state.booted) return;
        state.booted = true;

        if (!API || typeof API.getToken !== "function" || !API.getToken()) {
            window.location.href = "login.html";
            return;
        }

        /* Same rule as portal.js: only "recruiter" switches views. */
        state.view = currentView();
        if (state.view !== "student") return; // recruiter funnel placeholder stays as-is this stage

        bindFilters();
        bindList();
        bindRetry();
        bindLoadMore();

        try {
            var user = await window.SkillShareAuth.requireUser();
            if (!user) return; // 401 / no session: auth.js already redirected to login
        } catch (error) {
            showError(errorMessage(error));
            return;
        }

        await load(true).then(function (ok) { if (ok) refreshCounts(); });
    }

    /* ---------------- data loading ---------------- */

    async function load(reset) {
        if (state.loading) return false;
        state.loading = true;
        if (reset) {
            state.pendingConfirmId = null;
            showLoading();
        } else {
            setLoadMore(true);
        }

        var params = { limit: state.limit, offset: reset ? 0 : state.offset };
        if (state.status) params.status = state.status;

        var ok = false;
        try {
            var data = await API.getMyApplications(params);
            var rows = normalizeRows(data);
            var total = data && typeof data.total === "number" ? data.total : rows.length;
            var hasMore = Boolean(data && data.has_more);

            state.rows = reset ? rows.slice() : state.rows.concat(rows);
            state.offset = state.rows.length;
            state.total = total;
            state.hasMore = hasMore;
            render();
            ok = true;
        } catch (error) {
            var status = error && error.status;
            if (!reset) {
                setLoadMore(false);
                toast((error && (error.detail || error.message)) || "Could not load more applications.");
            } else if (status === 404 && state.status) {
                state.status = "";
                syncFilterTabs();
                toast("That status is no longer available. Showing all applications.");
                state.loading = false;
                return load(true); // propagate its result
            } else {
                showError(errorMessage(error));
            }
        } finally {
            state.loading = false;
            if (!reset) setLoadMore(false);
        }
        return ok;
    }

    function normalizeRows(data) {
        /* Backend contract: `applications`; tolerant read of `items`. */
        var list = (data && (data.applications || data.items)) || [];
        return Array.isArray(list) ? list : [];
    }

    /* Authoritative per-status totals for the pipeline strip
       (limit=1 keeps them small). Never fakes numbers. */
    function refreshCounts() {
        if (!API || !API.getToken()) return;
        Object.keys(PIPE_COUNTS).forEach(function (s) {
            API.getMyApplications({ status: s, limit: 1 }).then(function (d) {
                var el = $(PIPE_COUNTS[s]);
                if (el) el.textContent = String(d && typeof d.total === "number" ? d.total : 0);
            }).catch(function () { /* keep last known value */ });
        });
    }

    function reloadCurrent() { load(true); }

    /* ---------------- rendering ---------------- */

    function render() {
        state.pendingConfirmId = null;
        if (!state.rows.length) { showEmpty(); updateCount(); return; }
        var list = $("appList");
        if (list) list.innerHTML = state.rows.map(rowHtml).join("");
        renderListState();
        updateCount();
        setLoadMore(false);
    }

    function rowHtml(app) {
        var id = app && app.id != null ? app.id : "";
        var status = clean(app && app.status).toLowerCase();
        var meta = STATUS_META[status] || { label: prettyStatus(status), badge: "grey" };
        var title = clean(app && app.opportunity_title) || "Untitled opportunity";
        var company = clean(app && app.company_name);
        var initials = company
            ? company.split(/\s+/).slice(0, 2).map(function (w) { return (w[0] || "").toUpperCase(); }).join("")
            : "??";
        var note = clean(app && app.cover_note);
        var line = "Applied " + fmtDate(app && app.applied_at) + (note ? " \u00b7 " + truncate(note, 80) : "");

        return '<div class="row-item" data-app-id="' + esc(id) + '">' +
            '<div class="avatar sm" aria-hidden="true">' + esc(initials) + "</div>" +
            '<div class="grow"><h3>' + esc(title) +
            (company ? " \u00b7 " + esc(company) : "") + "</h3>" +
            "<p>" + esc(line) + "</p></div>" +
            '<span class="badge ' + esc(meta.badge) + '">' + esc(meta.label) + "</span>" +
            '<span class="row-actions">' + actionsHtml(app) + "</span>" +
            "</div>";
    }

    function actionsHtml(app) {
        var id = app && app.id != null ? app.id : "";
        var status = clean(app && app.status).toLowerCase();
        var open = (app && app.opportunity_id != null && app.opportunity_id !== "")
            ? '<a class="btn small ghost" href="opportunity-details.html?id=' +
              encodeURIComponent(app.opportunity_id) + '">Open</a>'
            : "";
        /* Only applied applications may be withdrawn (also enforced server-side). */
        if (status === "applied") {
            return open + '<button class="btn small" type="button" data-withdraw="' +
                esc(id) + '">Withdraw</button>';
        }
        return open;
    }

    function findRow(id) {
        var want = String(id);
        return state.rows.filter(function (r) { return String(r && r.id) === want; })[0] || null;
    }

    function rowEl(id) {
        return document.querySelector('.row-item[data-app-id="' + sel(id) + '"]');
    }

    function actionsCell(id) {
        var row = rowEl(id);
        return row ? row.querySelector(".row-actions") : null;
    }

    function updateCount() {
        var c = $("appCount");
        if (!c) return;
        if (!state.total) { c.textContent = ""; return; }
        if (state.total > state.rows.length) {
            c.textContent = state.rows.length + " of " + state.total + " applications";
        } else {
            c.textContent = state.total + (state.total === 1 ? " application" : " applications");
        }
    }

    /* ---------------- states ---------------- */

    function show(el, on) { if (el) el.hidden = !on; }

    function hideWrap() {
        var wrap = $("appLoadMoreWrap");
        if (wrap) wrap.hidden = true;
    }

    function showLoading() {
        show($("appList"), false);
        show($("appEmpty"), false);
        show($("appError"), false);
        show($("appLoading"), true);
        hideWrap();
    }

    function showEmpty() {
        var empty = $("appEmpty");
        show($("appList"), false);
        show($("appLoading"), false);
        show($("appError"), false);
        if (empty) {
            var head = empty.querySelector("h3");
            var para = empty.querySelector("p");
            if (state.status) {
                if (head) head.textContent = "No applications with this status";
                if (para) para.textContent = "Try a different filter, or browse opportunities to apply.";
            } else {
                if (head) head.textContent = "No applications yet";
                if (para) para.textContent = "Browse opportunities and apply to get started.";
            }
        }
        show(empty, true);
        hideWrap();
    }

    function showError(msg) {
        show($("appList"), false);
        show($("appLoading"), false);
        show($("appEmpty"), false);
        show($("appError"), true);
        var t = $("appErrorMsg");
        if (t) t.textContent = msg || "Something went wrong. Please try again.";
        hideWrap();
    }

    function renderListState() {
        show($("appLoading"), false);
        show($("appEmpty"), false);
        show($("appError"), false);
        show($("appList"), true);
    }

    function setLoadMore(busy) {
        var wrap = $("appLoadMoreWrap");
        var btn = $("appLoadMore");
        if (!wrap || !btn) return;
        wrap.hidden = !(state.hasMore && state.rows.length > 0);
        btn.disabled = Boolean(busy) || state.loading;
        btn.textContent = (busy || state.loading) ? "Loading\u2026" : "Load more";
    }

    /* ---------------- filters ---------------- */

    function bindFilters() {
        var bar = $("appFilters");
        if (!bar || bar.dataset.bound) return;
        bar.dataset.bound = "1";
        bar.addEventListener("click", function (e) {
            var t = e.target && e.target.closest ? e.target.closest("button[data-status]") : null;
            if (!t) return;
            var s = t.getAttribute("data-status") || "";
            if (s === state.status) return;
            state.status = s;
            bar.querySelectorAll("button[data-status]").forEach(function (b) {
                b.classList.toggle("active", b === t);
            });
            load(true);
        });
    }

    function syncFilterTabs() {
        var bar = $("appFilters");
        if (!bar) return;
        bar.querySelectorAll("button[data-status]").forEach(function (b) {
            b.classList.toggle("active", (b.getAttribute("data-status") || "") === state.status);
        });
    }

    function bindLoadMore() {
        var btn = $("appLoadMore");
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", function () { load(false); });
    }

    function bindRetry() {
        var btn = $("appRetry");
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", function () { load(true); });
    }

    /* ---------------- withdraw (inline two-step, in-row) ---------------- */

    function bindList() {
        var list = $("appList");
        if (!list || list.dataset.bound) return;
        list.dataset.bound = "1";
        list.addEventListener("click", function (e) {
            var t = e.target && e.target.closest ? e.target.closest("button") : null;
            if (!t) return;
            if (t.hasAttribute("data-withdraw")) {
                openConfirm(t.getAttribute("data-withdraw"));
            } else if (t.hasAttribute("data-withdraw-confirm")) {
                doWithdraw(t);
            } else if (t.hasAttribute("data-withdraw-cancel")) {
                restoreActions(t.getAttribute("data-withdraw-cancel"));
            }
        });
    }

    function openConfirm(id) {
        if (state.withdrawingId != null) return;
        if (state.pendingConfirmId != null && String(state.pendingConfirmId) !== String(id)) {
            restoreActions(state.pendingConfirmId);
        }
        state.pendingConfirmId = id;
        var cell = actionsCell(id);
        if (!cell) return;
        cell.innerHTML =
            '<span class="muted">Withdraw application?</span>' +
            '<button class="btn small" type="button" data-withdraw-confirm="' +
            esc(id) + '">Confirm</button>' +
            '<button class="btn small ghost" type="button" data-withdraw-cancel="' +
            esc(id) + '">Cancel</button>';
    }

    function restoreActions(id) {
        var app = findRow(id);
        var cell = actionsCell(id);
        if (String(state.pendingConfirmId) === String(id)) state.pendingConfirmId = null;
        if (cell && app) cell.innerHTML = actionsHtml(app);
    }

    function setConfirmBusy(id, busy) {
        var cell = actionsCell(id);
        if (!cell) return;
        var ok = cell.querySelector("[data-withdraw-confirm]");
        var no = cell.querySelector("[data-withdraw-cancel]");
        if (ok) { ok.disabled = busy; ok.textContent = busy ? "Withdrawing\u2026" : "Confirm"; }
        if (no) no.disabled = busy;
    }

    async function doWithdraw(btn) {
        var id = btn.getAttribute("data-withdraw-confirm");
        if (state.withdrawingId != null) return;
        var app = findRow(id);
        if (!app) { restoreActions(id); return; }
        if (clean(app.status).toLowerCase() !== "applied") {
            restoreActions(id);
            render();
            return;
        }

        state.withdrawingId = id;
        setConfirmBusy(id, true);
        try {
            var data = await API.withdrawApplication(id);
            var updated = (data && data.application) || null;
            var newStatus = updated && updated.status
                ? clean(updated.status).toLowerCase()
                : "withdrawn";
            applyStatus(id, newStatus);
            toast("Application withdrawn.");
            refreshCounts();
        } catch (error) {
            setConfirmBusy(id, false);
            handleWithdrawError(error, id);
        } finally {
            state.withdrawingId = null;
        }
    }

    function handleWithdrawError(error, id) {
        var status = error && error.status;
        if (status === 401) {
            /* api-client already cleared the session / fired auth-expired. */
            toast("Your session has expired. Please sign in again.");
            return;
        }
        if (status === 403) {
            toast("You can only withdraw your own application.");
            restoreActions(id);
            return;
        }
        if (status === 404) {
            removeRow(id);
            toast("This application no longer exists.");
            return;
        }
        if (status === 409) {
            toast("Only applications in status \u2018applied\u2019 can be withdrawn.");
            /* Backend is authoritative: refresh the row from the server. */
            reloadCurrent();
            return;
        }
        toast((error && (error.detail || error.message)) || "Could not withdraw application.");
        restoreActions(id);
    }

    /* Swap badge/actions in place — no full-page refresh. */
    function applyStatus(id, newStatus) {
        var app = findRow(id);
        if (app) app.status = newStatus;
        var row = rowEl(id);
        if (row && app) {
            var tmp = document.createElement("div");
            tmp.innerHTML = rowHtml(app);
            var fresh = tmp.firstElementChild;
            if (fresh) { row.replaceWith(fresh); return; }
        }
        render();
    }

    function removeRow(id) {
        var want = String(id);
        state.rows = state.rows.filter(function (r) { return String(r && r.id) !== want; });
        var row = rowEl(id);
        if (row) row.remove();
        if (state.total > 0) state.total -= 1;
        if (!state.rows.length) { showEmpty(); updateCount(); }
        else { updateCount(); setLoadMore(false); }
    }

    /* ---------------- go ---------------- */

    document.addEventListener("DOMContentLoaded", function () {
        boot().catch(function (e) {
            /* Never an unhandled rejection on this page. */
            // eslint-disable-next-line no-console
            console.error("[applications] boot failed:", e);
            showError(errorMessage(e));
        });
    });
})();

