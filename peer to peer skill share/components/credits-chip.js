/* =========================================================
   SKILLSHARE — SHARED CREDITS CHIP (components/credits-chip.js)

   Reads the REAL wallet from GET /api/credits through the EXISTING
   window.SkillShareAPI layer and paints any [data-credits-chip]
   element. The browser never writes a credit value — the server
   owns the balance (see credits.js / credits_api.py).

   Guarantees:
   - at most ONE /api/credits request per page load (a single-flight
     promise cache is shared by every chip on the page);
   - a chip element is bound at most once (data-credits-chip-bound),
     so repeated mount() calls never create duplicate listeners;
   - NO request at all when the session token is missing, so one
     user's balance is never exposed to another visitor;
   - a 401 keeps flowing through the existing skillshare:auth-expired
     handler in api-client.js (no new auth logic here).
   ========================================================= */

"use strict";

window.SkillShareCreditsChip = (function () {

    let inflight = null;
    let cachedBalance = null;

    function getApi() {
        return window.SkillShareAPI || null;
    }

    function fetchBalance() {
        if (cachedBalance !== null) return Promise.resolve(cachedBalance);
        if (inflight) return inflight;

        const api = getApi();
        if (!api || typeof api.getCredits !== "function") return Promise.resolve(null);
        try {
            if (typeof api.getToken === "function" && !api.getToken()) {
                /* Logged out: no request, no balance. */
                return Promise.resolve(null);
            }
        } catch (e) {
            return Promise.resolve(null);
        }

        inflight = api.getCredits()
            .then(function (res) {
                inflight = null;
                const raw = (res && typeof res.balance === "number") ? res.balance : null;
                if (raw === null) return null;
                cachedBalance = Math.max(0, Math.round(raw));
                return cachedBalance;
            })
            .catch(function () {
                inflight = null;
                return null;
            });
        return inflight;
    }

    function paint(el, balance) {
        if (!el) return;
        const value = el.querySelector("[data-credits-value]");
        if (balance === null) {
            /* No session or wallet unavailable: keep the link usable but
               do not display a number (and never a fake one). */
            el.classList.add("credits-chip-unavailable");
            return;
        }
        el.classList.remove("credits-chip-unavailable");
        const text = balance.toLocaleString("en-IN");
        if (value) value.textContent = text;
        el.setAttribute("aria-label", "Your credit balance: " + text + " credits. Open Credits & Rewards.");
    }

    function mount(selector) {
        const chips = document.querySelectorAll(selector || "[data-credits-chip]");
        if (!chips.length) return;

        const pending = [];
        chips.forEach(function (el) {
            if (el.dataset.creditsChipBound) return;
            el.dataset.creditsChipBound = "1";
            pending.push(el);
        });
        if (!pending.length) return;

        fetchBalance().then(function (balance) {
            pending.forEach(function (el) { paint(el, balance); });
        });
    }

    /* Re-fetch and repaint already-bound chips (e.g. right after this user
       spent credits or the daily allowance renewed). Never re-binds. */
    function refresh() {
        if (!window.SkillShareAPI) return Promise.resolve();
        try {
            if (typeof window.SkillShareAPI.getToken === "function" &&
                !window.SkillShareAPI.getToken()) return Promise.resolve();
        } catch (e) { return Promise.resolve(); }

        cachedBalance = null;
        inflight = null;
        const chips = document.querySelectorAll("[data-credits-chip]");
        if (!chips.length) return fetchBalance();
        const bound = [];
        chips.forEach(function (el) {
            if (el.dataset.creditsChipBound) bound.push(el);
        });
        return fetchBalance().then(function (balance) {
            bound.forEach(function (el) { paint(el, balance); });
        });
    }

    /* Auto-mount any chip already present in the page's own markup
       (idempotent: mount() binds each element exactly once). */
    document.addEventListener("DOMContentLoaded", function () {
        mount();
    });

    /* Any credit-spending/earning operation can dispatch this event to
       update the header balance without a page reload. */
    document.addEventListener("skillshare:credits-changed", function () {
        refresh();
    });

    /* Returning to the tab (e.g. after spending in another tab, or after
       the server's daily renewal) re-reads the wallet at most once per
       30 seconds so the chip never spams the API. */
    let lastVisibilityRefresh = 0;
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState !== "visible") return;
        const now = Date.now();
        if (now - lastVisibilityRefresh < 30000) return;
        lastVisibilityRefresh = now;
        refresh();
    });

    return {
        mount: mount,
        refresh: refresh,
        getBalance: fetchBalance
    };
})();
