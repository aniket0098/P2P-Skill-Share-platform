/* =========================================================
   SKILLSHARE — AUTHENTICATED CURRENT-USER SERVICE
   Reusable foundation for pages that need the real,
   authenticated user profile.

   Built on top of window.SkillShareAPI (api-client.js):
     - SkillShareAPI automatically attaches the JWT from
       localStorage ("skillshare_token") to every request.
     - The backend resolves the user from the JWT only —
       never from a user_id supplied by the frontend.

   Usage (after including api-client.js and auth.js):

       const user = await SkillShareAuth.requireUser();
       // -> real PostgreSQL record: { id, public_id, name,
       //    email, bio, skills, interests, avatar_url, ... }

   Behaviour:
     - No token          -> immediate redirect to login.html
     - 401 invalid/expired token -> session cleared, redirect
       to login.html (same behaviour as messages.js / requests.js)
     - Network error     -> NO redirect; the error is surfaced
       so the page can show a retry UI
     - 403               -> surfaced as an error (authenticated
       but not allowed); no redirect

   Events dispatched on window:
     - "skillshare:user-loaded"  { user }
     - "skillshare:user-error"   { error }
   ========================================================= */

window.SkillShareAuth = (() => {

    const LOGIN_PAGE = "login.html";

    let state = "idle";       // idle | loading | authenticated | unauthenticated | error
    let cachedUser = null;    // in-memory copy of the latest verified user
    let inFlight = null;      // dedupes concurrent getCurrentUser() calls
    let redirecting = false;

    /* -------------------------------------------------
       REDIRECT TO LOGIN (existing behaviour)
       ------------------------------------------------- */

    function redirectToLogin(reason) {
        if (redirecting) return;
        redirecting = true;

        window.location.href = LOGIN_PAGE;
    }

    /* -------------------------------------------------
       GLOBAL 401 HANDLER
       api-client.js clears the session and fires this
       event whenever ANY protected request returns 401.
       ------------------------------------------------- */

    window.addEventListener("skillshare:auth-expired", () => {
        state = "unauthenticated";
        cachedUser = null;
        redirectToLogin("expired");
    });

    /* -------------------------------------------------
       CURRENT USER
       ------------------------------------------------- */

    /**
     * Fetch (or reuse) the authenticated user's real profile.
     *
     * @param {object} [options]
     * @param {boolean} [options.force]  bypass the in-memory cache
     * @returns {Promise<object|null>}  the user record, or null
     *   when unauthenticated (after the login redirect starts).
     * @throws {Error}  network/server errors (error.status: 0 or HTTP code)
     */
    async function getCurrentUser(options = {}) {

        if (cachedUser && !options.force) {
            state = "authenticated";
            return cachedUser;
        }

        if (!window.SkillShareAPI) {
            const error = new Error("SkillShareAPI is not loaded. Include api-client.js before auth.js.");
            state = "error";
            window.dispatchEvent(new CustomEvent("skillshare:user-error", { detail: { error } }));
            throw error;
        }

        // No token at all -> cannot be logged in.
        if (!window.SkillShareAPI.getToken()) {
            state = "unauthenticated";
            cachedUser = null;
            redirectToLogin("no-token");
            return null;
        }

        // Reuse an in-flight request if several calls happen at once.
        if (inFlight && !options.force) return inFlight;

        state = "loading";

        inFlight = (async () => {
            try {
                // GET /me — backend resolves the user from the JWT.
                const data = await window.SkillShareAPI.getMe();
                const user = (data && data.user) || null;

                if (!user || user.id == null) {
                    throw new Error("Current-user endpoint returned no user.");
                }

                cachedUser = user;
                state = "authenticated";

                // Refresh the localStorage session cache so other
                // pages read up-to-date profile data.
                try {
                    window.SkillShareAPI.setSession(
                        window.SkillShareAPI.getToken(),
                        user
                    );
                } catch (storageError) { /* storage unavailable — non-fatal */ }

                window.dispatchEvent(new CustomEvent("skillshare:user-loaded", { detail: { user } }));

                return user;

            } catch (error) {

                if (error && error.status === 401) {
                    // Session cleared + redirect already handled by the
                    // global "skillshare:auth-expired" listener above.
                    state = "unauthenticated";
                    cachedUser = null;
                    return null;
                }

                // 403 or 5xx or network failure (status 0):
                // do NOT redirect, let the page decide (retry UI etc).
                state = "error";
                window.dispatchEvent(new CustomEvent("skillshare:user-error", { detail: { error } }));
                throw error;
            } finally {
                inFlight = null;
            }
        })();

        return inFlight;
    }

    /* -------------------------------------------------
       PAGE GUARD
       Convenience for protected pages: resolves with the
       user, or redirects to login and resolves with null.
       Network/server failures are re-thrown (no redirect)
       so the page can show a retry UI.
       ------------------------------------------------- */

    async function requireUser() {
        return getCurrentUser();
    }

    /* -------------------------------------------------
       STATE / ERROR HELPERS
       ------------------------------------------------- */

    function getState() {
        return state;
    }

    function getCachedUser() {
        return cachedUser;
    }

    function isNetworkError(error) {
        return Boolean(error && error.status === 0);
    }

    function isAuthError(error) {
        return Boolean(error && (error.status === 401 || error.status === 403));
    }

    /** Human-readable message for any current-user error. */
    function getErrorMessage(error) {
        if (!error) return "Something went wrong.";
        if (error.status === 0) {
            return "Server unavailable. Please check your connection and try again.";
        }
        if (error.status === 403) {
            return "You do not have permission to do that.";
        }
        if (error.detail) return error.detail;
        return error.message || "Something went wrong.";
    }

    /* -------------------------------------------------
       PUBLIC API
       ------------------------------------------------- */

    return {
        getCurrentUser,
        requireUser,
        getState,
        getCachedUser,
        isNetworkError,
        isAuthError,
        getErrorMessage,
    };

})();

