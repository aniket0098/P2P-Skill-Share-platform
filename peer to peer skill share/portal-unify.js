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
      "@media (max-width:900px){",
      "aside.sidebar,#sidebar{position:fixed !important;left:0;top:0;bottom:0;",
      "z-index:999;transform:translateX(-105%);transition:transform .25s ease;",
      "max-width:270px;width:82vw;}",
      "aside.sidebar.open,#sidebar.open{transform:none !important;}}",
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
    var header = document.querySelector("header.topbar, header");
    if (!header) return;
    var btn = document.createElement("button");
    btn.id = "portalMenuBtn";
    btn.className = "portal-menu-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open menu");
    btn.textContent = "☰";
    btn.style.cssText = "align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;font-size:17px;cursor:pointer;";
    header.insertBefore(btn, header.firstChild);
    var overlay = document.createElement("div");
    overlay.id = "portalDrawerOverlay";
    document.body.appendChild(overlay);
    function close() { side.classList.remove("open"); overlay.classList.remove("show"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = side.classList.toggle("open");
      overlay.classList.toggle("show", open);
    });
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }
  function profile() {
    var c = document.querySelector("#profileDropdownContainer");
    if (!c || c.children.length) return;
    if (window.SkillShareProfileDropdown) {
      try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
    }
  }
  function notifs() {
    document.querySelectorAll("[data-notifs]").forEach(function (b) {
      b.addEventListener("click", function () { window.location.href = "notifications.html"; });
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    ensureStyle(); syncActive(); drawer(); profile(); notifs();
  });
})();
