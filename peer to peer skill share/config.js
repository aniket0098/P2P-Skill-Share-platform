/* =========================================================
   SKILLSHARE — CENTRALIZED FRONTEND CONFIGURATION

   Single place for environment-specific values (API base
   URL). Every page loads this file BEFORE api-client.js,
   which reads window.SKILLSHARE_API_BASE.

   Local development:  leave the default (FastAPI running on
   http://127.0.0.1:8000).

   Production: set this to the deployed backend URL, e.g.
   const API_BASE_URL = "https://your-backend.onrender.com";
   (the real URL is chosen when the backend is deployed to
   Render — never hardcode credentials here).
   ========================================================= */

(function () {
    /* ------------------------------------------------------------------
       1. PRODUCTION API BASE URL

       Injected at BUILD TIME on Vercel from the SKILLSHARE_API_BASE
       environment variable (see generate-config.js + vercel.json).
       Leave it as "" in the repository — the real Render URL is never
       committed to Git. A page may also set window.SKILLSHARE_API_BASE
       before this file loads to override everything.
       ------------------------------------------------------------------ */
    const PRODUCTION_API_BASE_URL = "";

    /* ------------------------------------------------------------------
       2. LOCAL DEVELOPMENT DEFAULT (FastAPI running on 127.0.0.1:8000)
       ------------------------------------------------------------------ */
    const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";

    const hostname = window.location.hostname;
    const isLocal = ["localhost", "127.0.0.1", "[::1]", ""].includes(hostname);

    let API_BASE_URL =
        window.SKILLSHARE_API_BASE ||
        (isLocal ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL);

    if (!API_BASE_URL) {
        // Clear, diagnosable failure instead of silently calling localhost.
        console.error(
            "[SkillShare] No API base URL configured for this environment. " +
            "Set the SKILLSHARE_API_BASE environment variable in Vercel " +
            "(Project → Settings → Environment Variables) to your Render " +
            "backend URL, e.g. https://your-backend.onrender.com, then redeploy."
        );
        API_BASE_URL = LOCAL_API_BASE_URL;
    }

    window.SKILLSHARE_CONFIG = {
        API_BASE_URL: API_BASE_URL,
        IS_LOCAL: isLocal,
    };

    // Consumed by api-client.js (window.SkillShareAPI).
    window.SKILLSHARE_API_BASE = API_BASE_URL;
})();
