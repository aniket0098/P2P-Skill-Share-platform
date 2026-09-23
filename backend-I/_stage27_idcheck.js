/* STAGE 2.7 (temp tooling) — id cross-check between JS files and their HTML. */
const fs = require("fs");
const ROOT = "C:/project p2p/peer to peer skill share/";

function idsFromJs(file) {
  const s = fs.readFileSync(ROOT + file, "utf8");
  const out = new Set();
  const re = /\$\("([A-Za-z0-9_\-]+)"\)/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return out;
}
function idsFromHtml(file) {
  const s = fs.readFileSync(ROOT + file, "utf8");
  const out = new Set();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return out;
}
function dupes(file) {
  const s = fs.readFileSync(ROOT + file, "utf8");
  const seen = {}, dup = [];
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) {
    if (seen[m[1]]) dup.push(m[1]);
    seen[m[1]] = 1;
  }
  return dup;
}
function cmp(js, html) {
  const a = idsFromJs(js), b = idsFromHtml(html);
  const missing = [...a].filter((x) => !b.has(x));
  const unused = [...b].filter((x) => !a.has(x));
  console.log("JS: " + js + "   HTML: " + html);
  console.log("  ids used by JS but MISSING in HTML : " + (missing.join(", ") || "(none)"));
  console.log("  ids in HTML not referenced by JS   : " + (unused.join(", ") || "(none)"));
  console.log("  DUPLICATE ids in HTML             : " + (dupes(html).join(", ") || "(none)"));
}
cmp("jobs.js", "jobs.html");
cmp("opportunity-details.js", "opportunity-details.html");
