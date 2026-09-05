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
    // Allow an inline override (set window.SKILLSHARE_API_BASE
    // before this file loads, e.g. in a deployment-specific
    // script tag), otherwise use the local development default.
    const API_BASE_URL =
        window.SKILLSHARE_API_BASE || "http://127.0.0.1:8000";

    window.SKILLSHARE_CONFIG = {
        API_BASE_URL: API_BASE_URL,
    };

    // Consumed by api-client.js (window.SkillShareAPI).
    window.SKILLSHARE_API_BASE = API_BASE_URL;
})();
