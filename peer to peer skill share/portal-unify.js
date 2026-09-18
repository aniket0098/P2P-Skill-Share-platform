/* =========================================================
   SKILLSHARE — PORTAL UNIFY ADAPTER (portal-unify.js)
   STAGE 2 opt-in helper for EXISTING legacy pages.
   Include ONE line before </body>:
     <script src="portal-unify.js" defer></script>
   It does NOT replace sidebars/headers. It only:
   1. Highlights the current page link (active state sync,
      honouring each page's own .active/.selected convention).
   2. Adds a mobile drawer (hamburger + overlay) for static
      <aside class="sidebar"> layouts.
   3. Auto-inits the shared profile dropdown if its container
      exists and is empty.
   4. Routes notification buttons to notifications.html.
   5. Escape closes open dropdowns/drawers.
   No backend calls. No auth changes. Idempotent.
   TODO: Replace placeholder content with backend API data.
   ========================================================= */
"use strict";
(function () {
  function currentFile() {
    try {
      var b = document.body && document.body.dataset && document.body.dataset.page;
      if (b) return String(b).toLowerCase().split("?")[0].split("#")[0];
    } catch (e) {}
    return (window.location.pathname.split("/").pop() || "dashboard.html")
      .toLowerCase().split("?")[0].split("#")[0] || "dashboard.html";
  }
  function ensureDesignSystem(){
    try{
      var b=document.body;
      if(b&&!b.dataset.page){
        var f=currentFile();
        b.setAttribute('data-page',f);
      }
      if(!document.querySelector('link[data-ds="1"]')){
        var l=document.createElement('link');l.setAttribute('rel','stylesheet');
        l.setAttribute('href','design-system.css');l.setAttribute('data-ds','1');
        document.head.appendChild(l);
      }
    }catch(e){}
  }
  function ensureStyle() {
    ensureDesignSystem();
    if (document.getElementById("portalUnifyStyle")) return;
    var css = [
      ".portal-active-link{box-shadow:inset 3px 0 0 var(--primary,#7657ff) !important;}",
      "a.portal-active-link{color:#fff !important;}",
      "#portalDrawerOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);",
      "z-index:998;display:none;}",
      "#portalDrawerOverlay.show{display:block;}",
      "aside.sidebar,#sidebar{overscroll-behavior:contain;}",
      "@media (max-width:900px){",
      "aside.sidebar,#sidebar{position:fixed !important;left:0;top:0;bottom:0;",
      "z-index:999;transform:translateX(-105%);transition:transform .25s ease;",
      "max-width:270px;width:82vw;height:100vh;height:100dvh;-webkit-overflow-scrolling:touch;}",
      "aside.sidebar.open,#sidebar.open{transform:none !important;}",
      "body[data-portal-drawer]{overflow:hidden;}",
      /* Pages whose own CSS hides the sidebar at mobile widths
         (.sidebar{display:none}) would otherwise make the shared
         drawer open an invisible panel. This only applies where the
         shared drawer was actually created (body marker set by
         drawer() below), so intentionally hidden sidebars on pages
         with their own nav are untouched. */
      "body[data-portal-drawer] aside.sidebar,body[data-portal-drawer] #sidebar{display:block !important;}",
      "}",
      ".portal-menu-btn{display:none;}",
      "@media (max-width:900px){.portal-menu-btn{display:inline-flex !important;}}",
      "a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{",
      "outline:2px solid var(--primary-light,#9278ff);outline-offset:2px;}",
      "@media (prefers-reduced-motion:reduce){*{animation:none !important;transition:none !important;}}"
    ].join("\n");
    var st = document.createElement("style");
    st.id = "portalUnifyStyle";
    st.textContent = css;
    document.head.appendChild(st);
  }
  function syncActive() {
    var page = currentFile();
    var links = document.querySelectorAll(
      "#app-sidebar a, aside.sidebar a, .sidebar a, nav.side-menu a, nav.side-nav a, nav.sidebar-nav a"
    );
    if (!links.length) return;
    links.forEach(function (a) {
      var href = (a.getAttribute("href") || "").toLowerCase().split("?")[0].split("#")[0];
      if (!href || href.charAt(0) === "#" || href.indexOf(".html") === -1) return;
      var file = href.split("/").pop();
      if (file === page || (page === "talent-profile.html" && file === "find-talent.html")) {
        a.classList.add("portal-active-link");
        a.setAttribute("aria-current", "page");
        var nav = a.closest("nav");
        var hasActive = nav && nav.querySelector(".active:not(.portal-active-link), .selected");
        if (!hasActive && !a.classList.contains("active") && !a.classList.contains("selected")) {
          a.classList.add("active");
        }
      }
    });
  }
  function drawer() {
    var side = document.querySelector("aside.sidebar, #sidebar");
    if (!side || document.getElementById("portalMenuBtn")) return;
    if (document.getElementById("app-sidebar")) return; /* JS-rendered shell has own button */
    /* Pages that already ship their own mobile menu button (credits.html,
       community.html, innovation-lab*) must not get a second hamburger. */
    if (document.querySelector(".mobile-menu-btn, .mobile-menu, #mobileMenu")) return;
    var header = document.querySelector("header.topbar, header");
    if (!header) return;
    var btn = document.createElement("button");
    btn.id = "portalMenuBtn";
    btn.className = "portal-menu-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", side.id || "portal-drawer");
    if (!side.id) side.id = "portal-drawer";
    btn.textContent = "☰";
    btn.style.cssText = "align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:17px;cursor:pointer;";
    header.insertBefore(btn, header.firstChild);
    var overlay = document.createElement("div");
    overlay.id = "portalDrawerOverlay";
    document.body.appendChild(overlay);
    function setOpen(open) {
      side.classList.toggle("open", open);
      overlay.classList.toggle("show", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      /* Scroll lock lives in the <=900px media query, so it can only
         ever take effect on the mobile drawer. */
      document.body.toggleAttribute("data-portal-drawer", open);
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!side.classList.contains("open"));
    });
    overlay.addEventListener("click", function () { setOpen(false); });
    /* Selecting a destination closes the drawer on phones. */
    side.addEventListener("click", function (e) {
      var t = e.target;
      var link = t && t.closest ? t.closest("a") : null;
      if (!link) return;
      if (window.matchMedia && window.matchMedia("(max-width:900px)").matches) {
        setOpen(false);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }
  function loadSharedScript(src, onload) {
    /* Dedupe by src: pages that include portal-unify.js twice (or that
       already linked the component) must never inject/execute it twice,
       so no duplicate listeners or duplicate API calls are created. */
    var s = document.querySelector('script[data-ss-src="' + src + '"]');
    if (!s) {
      s = document.createElement("script");
      s.src = src; s.async = true;
      s.setAttribute("data-ss-src", src);
      s.addEventListener("load", function () { s.dataset.ssLoaded = "1"; });
      document.head.appendChild(s);
    }
    if (typeof onload === "function") {
      if (s.dataset.ssLoaded) { onload(); return; }
      s.addEventListener("load", onload);
    }
  }
  function hasApiLayer() {
    return !!(window.SkillShareAPI && typeof window.SkillShareAPI.getToken === "function");
  }
  function ensureSharedAssets() {
    /* Shared profile-dropdown + credits-chip styles on pages that never
       linked them. Marker-guarded so portal-shell.js never double-injects,
       and skipped entirely on pages that cannot use the shared controls
       (public/placeholder pages keep their header byte-identical). */
    if (!document.querySelector("#profileDropdownContainer, [data-credits-chip]") && !hasApiLayer()) return;
    ["components/profile-dropdown.css", "components/credits-chip.css"].forEach(function (href) {
      var key = href.split("/").pop();
      if (document.querySelector('link[data-ss-shared="' + key + '"]')) return;
      var l = document.createElement("link");
      l.setAttribute("rel", "stylesheet");
      l.setAttribute("href", href);
      l.setAttribute("data-ss-shared", key);
      document.head.appendChild(l);
    });
  }
  function hasOwnProfileUI() {
    /* Pages that ship their own profile block keep it — a second shared
       dropdown rendered next to it would show two profile controls and
       duplicate the component's fixed ids. Covers:
         .profile-wrapper / .profile-wrap / #profileButton / .profile-area
            -> analyze-skill, industry-skills, projects, live-learning
         .mini-profile -> profile.html (its own direct profile link)
         #userMenuButton -> setting.html (its own user menu)
         #userChip / .user-chip -> requests.html (its own user chip)
       The Credits chip is still inserted immediately before these own
       controls by profileControl() below. */
    return !!document.querySelector(
      ".profile-wrapper, .profile-wrap, #profileButton, .profile-area, " +
      ".mini-profile, #userMenuButton, #userChip, .user-chip"
    );
  }
  function ensureProfileContainer() {
    var c = document.getElementById("profileDropdownContainer");
    if (c) return c;
    if (hasOwnProfileUI()) return null;
    if (document.getElementById("app-topbar")) return null; /* shell owns the topbar */
    /* Only authenticated-capable pages (they ship config.js + api-client.js)
       get a profile control injected into an EXISTING top-right action area.
       Public/placeholder pages are left untouched (no bare <header> append). */
    if (!hasApiLayer()) return null;
    var header = document.querySelector(
      ".topbar .top-actions, header.topbar .top-actions, .topbar-right, .top-actions, " +
      ".header-actions, .head-right, .top-header .header-actions, header.header .header-actions"
    );
    if (!header) return null;
    c = document.createElement("div");
    c.id = "profileDropdownContainer";
    header.appendChild(c);
    return c;
  }
  function profile() {
    ensureProfileContainer();
    initProfileComponent();
  }
  function initProfileComponent() {
    var c = document.querySelector("#profileDropdownContainer");
    if (!c || c.children.length) return;
    if (window.SkillShareProfileDropdown) {
      try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
      return;
    }
    /* Only pages that already ship the API layer load the component on
       demand; pages without it keep today's behaviour (no new auth flow). */
    if (!hasApiLayer()) return;
    loadSharedScript("components/profile-dropdown.js", function () {
      try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
    });
  }
  function profileControl() {
    /* The page's OWN profile control, in priority order. The chip is
       inserted immediately before it so every authenticated page reads
       [Notifications][ Credits][ Profile] in its top-right area. */
    var c = document.querySelector("#profileDropdownContainer");
    if (c) return c;
    var w = document.querySelector(".profile-wrapper, .profile-wrap");
    if (w) return w;
    /* Bespoke controls kept as-is (profile.html / setting.html / requests). */
    return document.querySelector("#userChip, .mini-profile, #userMenuButton, #headerAvatar");
  }
  function mountCreditsChip() {
    /* Pages that already display a Credits control in the top-right
       (.credits-box on the Credits page) never get a second one. */
    var chip = document.querySelector("[data-credits-chip]");
    if (!chip) {
      if (document.querySelector(".credits-box, .credits-widget, #topCredits")) return;
      /* Only authenticated-capable pages get a chip: without the API layer
         there is no real balance to show, and a fake/empty pill is worse
         than no control at all. */
      if (!hasApiLayer()) return;
      chip = document.createElement("a");
      chip.className = "credits-chip";
      chip.href = "credits.html";
      chip.setAttribute("data-credits-chip", "");
      chip.setAttribute("title", "Your credit balance");
      chip.innerHTML = '<span class="cc-coin">&#129473;</span>' +
        '<span class="cc-num" data-credits-value>—</span><span class="cc-label">Credits</span>';
      var anchor = profileControl();
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(chip, anchor);
      } else {
        /* No profile control on this page: fall back to the page's own
           top-right action area, or do nothing at all. */
        var box = document.querySelector(".topbar-right, .top-actions, .header-actions, .head-right");
        if (!box) return;
        box.appendChild(chip);
      }
    }
    if (window.SkillShareCreditsChip) {
      try { window.SkillShareCreditsChip.mount("[data-credits-chip]"); } catch (e) {}
      return;
    }
    if (!hasApiLayer()) return;
    loadSharedScript("components/credits-chip.js", function () {
      try { window.SkillShareCreditsChip.mount("[data-credits-chip]"); } catch (e) {}
    });
  }
  function personalizeIdentity() {
    /* Legacy hand-written profile blocks hardcode "Anonymous"/"AD".
       Fill the REAL authenticated user's identity into them without
       touching their markup, CSS or dropdown wiring. */
    if (!hasOwnProfileUI()) return;
    var u = null;
    try { if (window.SkillShareAPI && window.SkillShareAPI.getUser) u = window.SkillShareAPI.getUser(); } catch (e) {}
    if (!u || !u.name) return;
    var name = String(u.name);
    var initials = name.trim().split(/\s+/).map(function (w) { return w ? w[0] : ""; })
      .join("").slice(0, 2).toUpperCase() || "?";
    var role = u.role ? String(u.role).toUpperCase() : "";
    document.querySelectorAll(".profile-wrapper, .profile-wrap").forEach(function (root) {
      if (root.dataset.identityDone) return;
      root.dataset.identityDone = "1";
      root.querySelectorAll(".profile-avatar, .avatar").forEach(function (av) {
        av.textContent = initials;
      });
      root.querySelectorAll("strong").forEach(function (s) {
        var t = (s.textContent || "").trim();
        if (/^(anonymous|member|—|-)$/i.test(t)) s.textContent = name;
      });
      if (role) {
        root.querySelectorAll(".profile-info span, .profile-text span, .profile-text small, .profile-info small")
          .forEach(function (s) {
            var t = (s.textContent || "").trim();
            if (/^(learner|member|student)(\s*[•\u2022]\s*.+)?$/i.test(t)) s.textContent = role;
          });
      }
    });
  }
  function notifs() {
    document.querySelectorAll("[data-notifs]").forEach(function (b) {
      b.addEventListener("click", function () { window.location.href = "notifications.html"; });
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    ensureStyle(); ensureSharedAssets();
    mountCreditsChip();
    personalizeIdentity();
    syncActive(); drawer(); profile(); notifs();
  });
})();
