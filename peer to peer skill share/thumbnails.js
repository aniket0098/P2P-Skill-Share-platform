/* =========================================================
   SKILLSHARE — Learning thumbnail system (inline SVG data-URIs)
   Deterministic, offline, consistent 16:9 visual identity per
   category. No external images, no broken URLs.

   window.SkillShareThumbs.thumb(item, opts) -> HTML string
   window.SkillShareThumbs.hero(item)         -> hero art HTML
   ========================================================= */
(function () {
"use strict";

var CATS = {
  "technology":      { a: "#1e3a8a", b: "#0e7490", c: "#38bdf8", icon: "&#60;/&#62;", label: "Tech" },
  "ai/data":         { a: "#312e81", b: "#4c1d95", c: "#a78bfa", icon: "&#9673;",  label: "AI" },
  "ai / data":       { a: "#312e81", b: "#4c1d95", c: "#a78bfa", icon: "&#9673;",  label: "AI" },
  "communication":   { a: "#7c2d12", b: "#92400e", c: "#fbbf24", icon: "&#9993;",  label: "Talk" },
  "career":          { a: "#134e4a", b: "#155e75", c: "#5eead4", icon: "&#8599;",  label: "Rise" },
  "business":        { a: "#0f766e", b: "#15804d", c: "#34d399", icon: "&#9642;",  label: "Biz" },
  "default":         { a: "#0f172a", b: "#1e293b", c: "#64748b", icon: "&#10022;", label: "Learn" }
};

function catFor(cat) {
  cat = String(cat || "").toLowerCase();
  return CATS[cat] || CATS["default"];
}

function glyphFor(skill) {
  var s = String(skill || "").trim();
  if (!s) return "?";
  var words = s.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svg(item) {
  var pal = catFor(item.category || item.skill);
  var glyph = glyphFor(item.skill || item.title);
  var x = 0, seed = String(item.skill || item.title || item.id || "x");
  for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) % 12;
  var dots = "";
  for (var d = 0; d < 10; d++) {
    var dx = 30 + ((d * 61 + x * 17) % 580);
    var dy = 40 + ((d * 47 + x * 13) % 260);
    var r = 4 + (d % 3) * 3;
    dots += '<circle cx="' + dx + '" cy="' + dy + '" r="' + r +
      '" fill="' + pal.c + '" opacity="0.10"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
    '<defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + pal.a + '"/>' +
    '<stop offset="1" stop-color="' + pal.b + '"/></linearGradient></defs>' +
    '<rect width="640" height="360" fill="url(#tg)"/>' + dots +
    '<rect x="12" y="12" width="26" height="26" rx="8" fill="rgba(255,255,255,0.10)"/>' +
    '<text x="25" y="32" font-size="15" fill="' + pal.c + '" text-anchor="middle">' +
    pal.icon + '</text>' +
    '<text x="320" y="205" font-size="120" font-weight="800" fill="#ffffff" ' +
    'opacity="0.16" text-anchor="middle" font-family="Arial,Helvetica">' + glyph + '</text>' +
    '<text x="320" y="300" font-size="30" font-weight="700" fill="#ffffff" ' +
    'text-anchor="middle" font-family="Arial,Helvetica">' + esc(item.skill || "Learning") + '</text>' +
    '<text x="320" y="330" font-size="17" fill="rgba(255,255,255,0.75)" ' +
    'text-anchor="middle" font-family="Arial,Helvetica">' + pal.label + ' path</text>' +
    '</svg>';
}

function thumbHTML(item, opts) {
  opts = opts || {};
  var data = "data:image/svg+xml;utf8," + encodeURIComponent(svg(item));
  var pills = "";
  var t = String(item.resource_type || "").toLowerCase();
  if (t === "video" || item.is_lecture) pills = '<span class="tn-tag video">Lecture</span>';
  else if (t === "course") pills = '<span class="tn-tag course">Course</span>';
  else pills = '<span class="tn-tag reading">Reading</span>';
  var badge = "";
  if (opts.video || item.watchable) badge = '<span class="tn-play" title="Watchable lecture">&#9654;</span>';
  else badge = '<span class="tn-open" title="Open external resource">&#8599;</span>';
  return '<div class="tn" style="background-image:url(\'' + data + '\')">' +
    pills + badge + '</div>';
}

window.SkillShareThumbs = {
  thumb: thumbHTML,
  hero: function (item) {
    var pal = catFor(item.category || item.skill);
    var data = "data:image/svg+xml;utf8," + encodeURIComponent(svg(item || {}));
    return '<div class="tn tn-hero" style="background-image:url(\'' + data + '\')">' +
      '<span class="tn-tag ' + (item.watchable ? "video" : "course") + '">' +
      (item.watchable ? "Watchable" : "Learning path") + '</span></div>';
  }
};
})();