/* =========================================================
   SKILLSHARE — CREDITS & REWARDS
   Wallet · Rewards · Reputation (frontend prototype)

   DATA SOURCE: clearly-identified DEMO data below.
   BACKEND (Flask + PostgreSQL) later:
     GET  /api/credits           -> balance + monthly stats
     GET  /api/credits/history   -> activity list
     GET  /api/credits/rewards   -> review reward tiers
     GET  /api/reviews           -> reputation + reviews
     POST /api/credits/purchase  -> real payment flow

   SECURITY: the frontend never writes the credit balance.
   Purchases/rewards must be validated server-side.
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       1. DEMO DATA (isolated — replace with API responses)
       type drives the filter tabs:
       earned | spent | purchased | rewards
    ===================================================== */

    const CREDITS_DEMO = {
        balance: 0,
        earnedThisMonth: 0,
        spentThisMonth: 0,
        reviewsReceived: 0,
        averageRating: 0,
        monthlyGoal: 0,
        activity: []
    };


    /* =====================================================
       2. DATA LOADER (single replacement point for the API)
    ===================================================== */

    function loadCreditsData() {

        /* Future: return fetch("/api/credits").then(r => r.json())
           — every renderer below consumes this object only.
           Until the backend is wired, the wallet and every
           counter render 0 — no seeded demo values reach the UI. */

        return {
            balance: 0,
            earnedThisMonth: 0,
            spentThisMonth: 0,
            reviewsReceived: 0,
            averageRating: 0,
            monthlyGoal: 0,
            activity: []
        };

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

        if (walletBalance) {
            walletBalance.dataset.count = data.balance;
        }

        if (topCredits) {
            topCredits.textContent = formatCredits(data.balance);
        }

        /* All [data-count] figures (hero, stats, progress, rating)
           count up when the reveal observer marks them visible. */

    }


    /* =====================================================
       6. ACTIVITY LIST + FILTERS
    ===================================================== */

    function renderActivity(filter) {

        if (!activityList) return;

        const data = loadCreditsData();

        const items = data.activity.filter(item =>
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

                renderActivity(button.dataset.filter);

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

    function initializeBuyFlow() {

        /* Buy buttons carry package data via data-attributes. */

        document.querySelectorAll(".buy-btn").forEach(button => {

            button.addEventListener("click", () => {

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

            });

        });

        /* Continue = prototype only: no payment, no balance change.
           BACKEND HOOK: POST /api/credits/purchase goes here. */

        const continueBtn =
            document.getElementById("buyModalContinue");

        if (continueBtn) {

            continueBtn.addEventListener("click", () => {

                closeModal(buyModal);

                showToast(
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

        /* Wallet hero "Buy Credits" = default highlighted package. */

        const heroBuyBtn = document.getElementById("buyCreditsBtn");

        if (heroBuyBtn) {

            heroBuyBtn.addEventListener("click", () => {

                if (buyModalCredits) buyModalCredits.textContent = "1,200";

                if (buyModalPrice) buyModalPrice.textContent = "₹99";

                openModal(buyModal);

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

    function initializeCreditsPage() {

        const data = loadCreditsData();

        renderWallet(data);

        renderActivity("all");

        initializeFilters();

        initializeBuyFlow();

        initializeEarnModal();

        initializeModalDismiss();

        initializeNavigation();

        initializeReveal();

        initializeMisc();

        console.log(
            "SkillShare Credits page loaded · prototype data"
        );

    }

    initializeCreditsPage();

});
