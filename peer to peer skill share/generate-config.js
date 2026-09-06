/* =========================================================
   Vercel BUILD STEP — inject SKILLSHARE_API_BASE into config.js

   Vercel runs this once per deployment (see vercel.json). It
   reads the SKILLSHARE_API_BASE environment variable from the
   Vercel dashboard (your Render backend URL) and writes it
   into the build copy of config.js. The source file in Git
   always keeps the empty placeholder — no secrets, no URLs.

   If the variable is not set, config.js is left unchanged and
   the hostname auto-detection in config.js still applies.
   ========================================================= */

const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "config.js");
const marker = 'const PRODUCTION_API_BASE_URL = "";';
const envUrl = (process.env.SKILLSHARE_API_BASE || "").trim().replace(/\/+$/, "");

let content;
try {
    content = fs.readFileSync(target, "utf8");
} catch (error) {
    console.error("[generate-config] Cannot read config.js:", error.message);
    process.exit(1);
}

if (!envUrl) {
    console.log(
        "[generate-config] SKILLSHARE_API_BASE is not set — config.js left " +
        "unchanged (hostname auto-detection still applies)."
    );
} else if (content.includes(marker)) {
    content = content.replace(marker, `const PRODUCTION_API_BASE_URL = "${envUrl}";`);
    fs.writeFileSync(target, content, "utf8");
    console.log(
        "[generate-config] Injected SKILLSHARE_API_BASE into config.js " +
        "(build copy only — the Git source is untouched)."
    );
} else if (content.includes(`const PRODUCTION_API_BASE_URL = "${envUrl}"`)) {
    console.log(
        "[generate-config] config.js already contains this SKILLSHARE_API_BASE " +
        "value — nothing to do."
    );
} else {
    console.error(
        "[generate-config] Marker line not found in config.js — refusing " +
        "to inject. Restore the placeholder line: " + marker
    );
    process.exit(1);
}
