/* =========================================================
   SKILLSHARE — CREDITS & REWARDS
   Wallet · Rewards · Reputation

   DATA SOURCE: PostgreSQL through window.SkillShareAPI. The
   server returns the balance and the ledger; the browser only
   displays them (it never writes a credit value):
     GET  /api/credits           -> balance + monthly stats
     GET  /api/credits/history   -> activity list
     GET  /api/credits/packages  -> purchasable credit packs
     POST /api/credits/purchase  -> purchase intent (payment)

   SECURITY: the frontend never writes the credit balance.
   Purchases/rewards are validated server-side.
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       1. WALLET STATE (PostgreSQL is the source of truth)
       The balance is NEVER computed or stored in the browser:
       this page only DISPLAYS what GET /api/credits and
       GET /api/credits/history return for the logged-in user.
       type drives the filter tabs:
       earned | spent | purchased | rewards
    ===================================================== */

    const CREDITS_EMPTY = {
        balance: 0,
        dailyCredits: 0,
        purchasedCredits: 0,
        earnedThisMonth: 0,
        spentThisMonth: 0,
        reviewsReceived: 0,
        averageRating: 0,
        monthlyGoal: 500,
        activity: []
    };

    let creditsState = { ...CREDITS_EMPTY };

    /* Tabs + purchase state (UI only — the server owns all credit values). */

    let currentFilter = "all";

    let selectedPackageKey = "Popular";

    /* One id per buy attempt: reusing it makes a double-click / retry return
       the SAME purchase instead of creating a second one server-side. */

    let pendingPurchaseId = null;

    /* Packages are priced by the SERVER; these keys only name the product. */

    const CREDIT_PACKAGES_BY_CREDITS = {
        500: "Starter",
        1200: "Popular",
        3000: "Pro",
        7000: "Premium"
    };


    /* =====================================================
       2. DATA LOADER (server only — no seeded demo values)
    ===================================================== */

    function creditsApi() {
        return window.SkillShareAPI || null;
    }

    function formatActivityWhen(iso) {
        /* Server timestamps are ISO/UTC; the locale decides the display. */
        const when = new Date(iso);
        if (Number.isNaN(when.getTime())) return "";
        return when.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function mapActivityRow(row) {
        return {
            id: row.id,
            type: row.type || "rewards",
            icon: row.icon || "fa-solid fa-coins",
            title: row.title || "Credit activity",
            detail: row.detail || "",
            amount: Number(row.amount || 0),
            date: formatActivityWhen(row.date),
            room_id: row.room_id || null
        };
    }

    /* Single replacement point: every renderer below consumes this object. */
    async function loadCreditsData() {

        const api = creditsApi();

        if (!api || !api.getCredits) {
            showToast("Credits are unavailable right now.");
            return { ...CREDITS_EMPTY };
        }

        try {

            const [wallet, history] = await Promise.all([
                api.getCredits(),
                api.getCreditsHistory("all", 100)
            ]);

            return {
                balance: Number(wallet.balance || 0),
                dailyCredits: Number(wallet.daily_credits || 0),
                purchasedCredits: Number(wallet.purchased_credits || 0),
                earnedThisMonth: Number(wallet.earnedThisMonth || 0),
                spentThisMonth: Number(wallet.spentThisMonth || 0),
                reviewsReceived: Number(wallet.reviewsReceived || 0),
                averageRating: Number(wallet.averageRating || 0),
                monthlyGoal: Number(wallet.monthlyGoal || 500),
                activity: (history.activity || []).map(mapActivityRow)
            };

        } catch (error) {

            showToast(
                (error && error.message) ||
                    "Could not load your credits. Please try again."
            );

            return { ...CREDITS_EMPTY };

        }

    }


    /* =====================================================
       3. ELEMENTS
    ===================================================== */

    const sidebar = document.getElementById("sidebar");

    const mobileMenuBtn = document.getElementById("mobileMenuBtn");

    const profileBtn = document.getElementById("profileBtn");

    const profileMenu = document.getElementById("profileMenu");

    const topCredits = document.getElementById("topCredits");

    const walletBalance = document.getElementById("walletBalance");

    const activityList = document.getElementById("activityList");

    const filterButtons =
        document.querySelectorAll(".filter-btn");

    const buyModal = document.getElementById("buyModal");

    const buyModalCredits =
        document.getElementById("buyModalCredits");

    const buyModalPrice =
        document.getElementById("buyModalPrice");

    const earnModal = document.getElementById("earnModal");

    const toast = document.getElementById("toast");

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;


    /* =====================================================
       4. HELPERS
    ===================================================== */

    function formatCredits(value) {
        return Math.abs(value).toLocaleString("en-IN");
    }

    let toastTimer;

    function showToast(message) {

        if (!toast) return;

        toast.textContent = message;

        toast.classList.add("show");

        window.clearTimeout(toastTimer);

        toastTimer = window.setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);

    }

    function animateCountUp(element) {

        const target = Number(element.dataset.count || 0);

        const divisor = Number(element.dataset.divisor || 1);

        const prefix = element.dataset.prefix || "";

        const suffix = element.dataset.suffix || "";

        const finalValue = target / divisor;

        function render(value) {

            element.textContent =
                prefix +
                (divisor === 1
                    ? Math.round(value).toLocaleString("en-IN")
                    : value.toFixed(1)) +
                suffix;

        }

        if (reduceMotion) {

            render(finalValue);

            return;

        }

        const duration = 1200;

        const startTime = performance.now();

        function tick(now) {

            const progress =
                Math.min((now - startTime) / duration, 1);

            const eased = 1 - Math.pow(1 - progress, 3);

            render(finalValue * eased);

            if (progress < 1) {
                requestAnimationFrame(tick);
            }

        }

        requestAnimationFrame(tick);

    }

    /* =====================================================
       5. WALLET + STATS RENDER
    ===================================================== */

    function renderWallet(data) {

        if (topCredits) {
            topCredits.textContent = formatCredits(data.balance);
        }

        /* Every [data-count] figure is animated here (once), so the reveal
           observer never re-runs it — dataset.counted is the same guard the
           scroll reveal uses. */
        setFigure(walletBalance, data.balance);
        setFigure(document.getElementById("statAvailable"), data.balance);
        setFigure(document.getElementById("statEarned"), data.earnedThisMonth);
        setFigure(document.getElementById("statSpent"), data.spentThisMonth);
        setFigure(document.getElementById("statReviews"), data.reviewsReceived);
        setFigure(document.getElementById("statRating"), data.averageRating);
        setFigure(
            document.getElementById("progressCurrent"),
            data.earnedThisMonth
        );
        setFigure(document.getElementById("ratingBig"), data.averageRating);

        renderMonthlyNote(data);
        renderMonthProgress(data);

    }

    function setFigure(element, value) {

        if (!element) return;

        element.dataset.count = value;
        element.dataset.counted = "true";

        animateCountUp(element);

    }

    function renderMonthlyNote(data) {

        const note = document.querySelector(".wallet-month");

        if (!note) return;

        if (data.earnedThisMonth > 0) {

            note.innerHTML =
                '<i class="fa-solid fa-arrow-trend-up"></i> ' +
                "+" +
                formatCredits(data.earnedThisMonth) +
                " credits earned this month.";

        } else {

            note.innerHTML =
                '<i class="fa-solid fa-arrow-trend-up"></i> No earnings yet.';

        }

    }

    function renderMonthProgress(data) {

        const track = document.getElementById("monthProgress");

        if (!track) return;

        const goal = data.monthlyGoal || 500;

        const percent = Math.min(
            100,
            Math.round((data.earnedThisMonth / goal) * 100)
        );

        track.setAttribute("aria-valuemax", goal);

        track.setAttribute("aria-valuenow", data.earnedThisMonth);

        const fill = track.querySelector(".progress-fill");

        if (fill) {

            fill.dataset.progress = percent;

            /* The section may already be revealed — set the width directly so
               the bar is correct no matter when the API answers. */

            fill.style.width = percent + "%";

        }

    }


    /* =====================================================
       6. ACTIVITY LIST + FILTERS
    ===================================================== */

    function renderActivity(filter) {

        if (!activityList) return;

        /* Server rows only — the wallet is never recomputed in the browser. */

        const items = creditsState.activity.filter(item =>
            filter === "all" ? true : item.type === filter
        );

        if (items.length === 0) {

            activityList.innerHTML =
                `<div class="activity-empty">No ${filter} activity yet.</div>`;

            return;

        }

        activityList.innerHTML = items.map(item => {

            const positive = item.amount >= 0;

            return `
                <article class="activity-item">

                    <span class="activity-icon ${item.type}">
                        <i class="${item.icon}"></i>
                    </span>

                    <div class="activity-info">

                        <b>${item.title}</b>
                        <span>${item.detail}</span>

                    </div>

                    <span class="activity-when">${item.date}</span>

                    <span
                        class="activity-amount ${positive ? "positive" : "negative"}"
                        aria-label="${positive ? "plus" : "minus"} ${formatCredits(item.amount)} credits"
                    >
                        ${positive ? "+" : "-"}${formatCredits(item.amount)}
                    </span>

                </article>
            `;

        }).join("");

    }

    function initializeFilters() {

        filterButtons.forEach(button => {

            button.addEventListener("click", () => {

                filterButtons.forEach(btn => {
                    btn.classList.remove("active");
                    btn.setAttribute("aria-selected", "false");
                });

                button.classList.add("active");
                button.setAttribute("aria-selected", "true");

                currentFilter = button.dataset.filter || "all";

                renderActivity(currentFilter);

            });

        });

    }


    /* =====================================================
       7. MODALS
    ===================================================== */

    function openModal(modal) {

        if (!modal) return;

        modal.hidden = false;

        document.body.style.overflow = "hidden";

        const closeBtn = modal.querySelector(".modal-close");

        if (closeBtn) closeBtn.focus();

    }

    function closeModal(modal) {

        if (!modal) return;

        modal.hidden = true;

        document.body.style.overflow = "";

    }

    function packageKeyFor(button) {

        return (
            button.dataset.package ||
            CREDIT_PACKAGES_BY_CREDITS[Number(button.dataset.credits || 0)] ||
            "Popular"
        );

    }

    function newRequestId() {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        /* RFC-4122 v4 fallback for browsers without crypto.randomUUID. */

        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
            /[xy]/g,
            char => {

                const random = (Math.random() * 16) | 0;

                const value =
                    char === "x" ? random : (random & 0x3) | 0x8;

                return value.toString(16);

            }
        );

    }

    function selectPackage(button) {

        selectedPackageKey = packageKeyFor(button);

        /* New attempt => new idempotency id (held until the attempt ends). */

        pendingPurchaseId = newRequestId();

        if (buyModalCredits) {
            buyModalCredits.textContent = formatCredits(
                Number(button.dataset.credits || 0)
            );
        }

        if (buyModalPrice) {
            buyModalPrice.textContent =
                "₹" + Number(button.dataset.price || 0);
        }

        openModal(buyModal);

    }

    /* The browser NEVER allocates credits: it only asks the server to start a
       purchase. Until a payment provider is configured the API answers 202
       with payment.status "not_configured" and allocates nothing. */

    async function requestPurchase() {

        const api = creditsApi();

        if (!api || !api.purchaseCredits) {

            showToast("Purchases are unavailable right now.");

            return null;

        }

        const continueBtn = document.getElementById("buyModalContinue");

        if (continueBtn) continueBtn.disabled = true;

        try {

            const purchase = await api.purchaseCredits(
                selectedPackageKey,
                pendingPurchaseId || newRequestId()
            );

            /* A purchase was recorded server-side — tell the top-right
               balance widget to re-read the wallet. */
            document.dispatchEvent(new CustomEvent("skillshare:credits-changed"));

            return purchase;

        } catch (error) {

            showToast(
                (error && error.message) || "Purchase request failed."
            );

            return null;

        } finally {

            if (continueBtn) continueBtn.disabled = false;

        }

    }

    async function refreshCredits() {

        creditsState = await loadCreditsData();

        renderWallet(creditsState);

        renderActivity(currentFilter);

    }

    /* The SERVER prices the packages (GET /api/credits/packages). The cards in
       the markup carry the same keys, so their credits/price are re-synced from
       the server: a server-side price change can never leave a stale price on
       screen (the modal then sends only the KEY — never an amount). */
    async function syncPackages() {

        const api = creditsApi();

        if (!api || !api.getCreditPackages) return;

        try {

            const data = await api.getCreditPackages();

            (data.packages || []).forEach(pack => {

                const button = document.querySelector(
                    '.buy-btn[data-package="' + pack.key + '"]'
                );

                if (!button) return;

                const credits = Number(pack.credits || 0);

                const rupees = Number(pack.amount_minor || 0) / 100;

                button.dataset.credits = String(credits);

                button.dataset.price = String(rupees);

                const card = button.closest(".package-card");

                if (!card) return;

                const creditsEl = card.querySelector(".package-credits");

                if (creditsEl) creditsEl.textContent = formatCredits(credits);

                const priceEl = card.querySelector(".package-price");

                if (priceEl) priceEl.textContent = "₹" + rupees;

                const valueEl = card.querySelector(".package-value");

                if (valueEl && credits) {

                    const perCredit = "₹" + (rupees / credits).toFixed(3)
                        + " per credit";

                    valueEl.textContent = card.classList.contains("popular")
                        ? "Best value · " + perCredit
                        : perCredit;

                }

            });

        } catch (error) {

            /* Non-fatal: the cards keep their shipped values. */

            console.warn("Credit package sync failed:", error);

        }

    }

    function initializeBuyFlow() {

        /* Buy buttons carry package data via data-attributes. */

        document.querySelectorAll(".buy-btn").forEach(button => {

            button.addEventListener("click", () => {

                selectPackage(button);

            });

        });

        /* Continue asks the server to start the purchase. No client-side
           balance change ever happens here. */

        const continueBtn =
            document.getElementById("buyModalContinue");

        if (continueBtn) {

            continueBtn.addEventListener("click", async () => {

                const result = await requestPurchase();

                closeModal(buyModal);

                pendingPurchaseId = null;

                if (!result) return;

                if (result.payment && result.payment.status === "paid") {

                    showToast("Payment received — credits added.");

                    await refreshCredits();

                    return;

                }

                showToast(
                    result.message ||
                        "Payment integration coming soon — no credits were charged."
                );

            });

        }

        const cancelBtn = document.getElementById("buyModalCancel");

        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => closeModal(buyModal));
        }

        const closeBtn = document.getElementById("buyModalClose");

        if (closeBtn) {
            closeBtn.addEventListener("click", () => closeModal(buyModal));
        }

        /* Wallet hero "Buy Credits" = default highlighted package (Popular). */

        const heroBuyBtn = document.getElementById("buyCreditsBtn");

        if (heroBuyBtn) {

            heroBuyBtn.addEventListener("click", () => {

                const popularBtn =
                    document.querySelector('.buy-btn[data-credits="1200"]') ||
                    document.querySelector(".buy-btn");

                if (popularBtn) {

                    selectPackage(popularBtn);

                } else {

                    selectPackage({
                        dataset: { credits: 1200, price: 99, package: "Popular" }
                    });

                }

            });

        }

    }

    function initializeEarnModal() {

        function open() {
            openModal(earnModal);
        }

        const heroEarnBtn = document.getElementById("earnCreditsBtn");

        if (heroEarnBtn) {
            heroEarnBtn.addEventListener("click", open);
        }

        const sectionBtn = document.getElementById("earnSectionBtn");

        if (sectionBtn) {
            sectionBtn.addEventListener("click", open);
        }

        const closeBtn = document.getElementById("earnModalClose");

        if (closeBtn) {
            closeBtn.addEventListener("click", () => closeModal(earnModal));
        }

        const okBtn = document.getElementById("earnModalOk");

        if (okBtn) {
            okBtn.addEventListener("click", () => closeModal(earnModal));
        }

    }

    function initializeModalDismiss() {

        /* Click on the dark overlay closes the dialog. */

        [buyModal, earnModal].forEach(modal => {

            if (!modal) return;

            modal.addEventListener("click", event => {

                if (event.target === modal) {
                    closeModal(modal);
                }

            });

        });

        /* Escape closes everything. */

        document.addEventListener("keydown", event => {

            if (event.key === "Escape") {

                closeModal(buyModal);

                closeModal(earnModal);

            }

        });

    }


    /* =====================================================
       8. NAVIGATION (self-contained sidebar + profile menu)
    ===================================================== */

    function initializeNavigation() {

        if (mobileMenuBtn && sidebar) {

            mobileMenuBtn.addEventListener("click", () => {
                sidebar.classList.toggle("open");
            });

        }

        if (profileBtn && profileMenu) {

            profileBtn.addEventListener("click", event => {

                event.stopPropagation();

                profileMenu.hidden = !profileMenu.hidden;

            });

            document.addEventListener("click", event => {

                if (
                    !profileMenu.hidden &&
                    !profileMenu.contains(event.target) &&
                    !profileBtn.contains(event.target)
                ) {
                    profileMenu.hidden = true;
                }

            });

        }

    }


    /* =====================================================
       9. SCROLL REVEAL + PROGRESS ANIMATIONS
       When a section becomes visible: reveal it, animate
       its progress/insight/breakdown bars and count up its
       [data-count] figures.
    ===================================================== */

    function activateSection(section) {

        section.classList.add("visible");

        section.querySelectorAll(
            ".progress-fill, .insight-fill, .breakdown-fill"
        ).forEach(bar => {

            bar.style.width = (bar.dataset.progress || 0) + "%";

        });

        section.querySelectorAll("[data-count]").forEach(figure => {

            if (!figure.dataset.counted) {

                figure.dataset.counted = "true";

                animateCountUp(figure);

            }

        });

    }

    function initializeReveal() {

        const sections = document.querySelectorAll(".reveal");

        if (!("IntersectionObserver" in window) || reduceMotion) {

            sections.forEach(activateSection);

            return;

        }

        const observer = new IntersectionObserver(entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    activateSection(entry.target);

                    observer.unobserve(entry.target);

                }

            });

        }, { threshold: 0.12 });

        sections.forEach(section => observer.observe(section));

    }


    /* =====================================================
       10. MISC ACTIONS
    ===================================================== */

    function initializeMisc() {

        /* No full reviews page exists yet — keep the link honest. */

        const viewAllBtn = document.getElementById("viewAllReviews");

        if (viewAllBtn) {

            viewAllBtn.addEventListener("click", () => {

                showToast(
                    "Full review history is coming soon."
                );

            });

        }

    }


    /* =====================================================
       11. INIT
    ===================================================== */

    async function initializeCreditsPage() {

        initializeFilters();

        initializeBuyFlow();

        initializeEarnModal();

        initializeModalDismiss();

        initializeNavigation();

        initializeReveal();

        initializeMisc();

        /* PostgreSQL is the source of truth: render ONLY after the server
           answers (the page shows 0 / "no activity" until then). */

        await syncPackages();

        await refreshCredits();

        console.log(
            "SkillShare Credits page loaded · live wallet data"
        );

    }

    initializeCreditsPage();

});
