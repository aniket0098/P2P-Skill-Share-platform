/* =========================================================
   SKILLSHARE — FRONTEND API CLIENT
   Single communication layer between the UI and the FastAPI
   backend (PostgreSQL is the source of truth).

   Every protected request automatically attaches the JWT stored
   in localStorage by the login page.

   LocalStorage is ONLY used for the auth session (token + user),
   never as a request / connection / message database.
   ========================================================= */

window.SkillShareAPI = (() => {
    const baseUrl = window.SKILLSHARE_API_BASE || "http://127.0.0.1:8000";
    const TOKEN_KEY = "skillshare_token";
    const USER_KEY = "skillshare_user";

    /* -------------------------------------------------
       SESSION HELPERS
    ------------------------------------------------- */
    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY)) || null;
        } catch (error) {
            return null;
        }
    }

    function setSession(token, user) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    /* -------------------------------------------------
       CORE REQUEST WRAPPER
    ------------------------------------------------- */
    async function request(path, options = {}) {
        const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

        const token = getToken();
        if (token) headers["Authorization"] = "Bearer " + token;

        let response;
        try {
            response = await fetch(baseUrl + path, {
                ...options,
                headers,
                credentials: "include",
            });
        } catch (error) {
            const networkError = new Error("Server unavailable. Please check that the backend is running.");
            networkError.status = 0;
            throw networkError;
        }

        // Session expired / invalid token
        if (response.status === 401) {
            clearSession();
            window.dispatchEvent(new CustomEvent("skillshare:auth-expired", { detail: { status: 401 } }));
        }

        if (!response.ok) {
            let detail = null;
            let body = null;
            try { body = await response.json(); } catch (error) { /* ignore parse errors */ }
            if (body) detail = body.detail || body.message || null;
            const error = new Error(detail || `Request failed (${response.status})`);
            error.status = response.status;
            error.detail = detail;
            error.payload = body;
            throw error;
        }

        if (response.status === 204) return null;
        return response.json();
    }

    /* -------------------------------------------------
       PUBLIC API
    ------------------------------------------------- */
    return {
        baseUrl,
        getToken,
        getUser,
        setSession,
        clearSession,

        // --- Authentication ---
        login: (email, password) =>
            request("/login", { method: "POST", body: JSON.stringify({ email, password }) }),
        signup: (name, email, password) =>
            request("/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }),
        getMe: () => request("/me"),
        getDashboard: () => request("/api/dashboard"),

        // Public, aggregated platform statistics (no auth required).
        getStats: () => request("/api/stats"),

        // Append a skill to the AUTHENTICATED user's own
        // profile (backend derives the user from the JWT).
                        addMySkill: (name) =>
            request("/api/users/me/skills", {
                method: "PATCH",
                body: JSON.stringify({ name }),
            }),

        // Fetch the authenticated user's live PostgreSQL record.
        // The user is resolved server-side from the JWT "sub" claim.
        getMe: () => request("/users/me"),

        // Update the AUTHENTICATED user's own profile. The user is
        // derived from the JWT server-side; no user_id is sent.
        updateMyProfile: (data) =>
            request("/api/users/me", {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),

        // --- Users ---
        listUsers: () => request("/api/users"),
        searchUsers: (query) =>
            request("/api/users/search?q=" + encodeURIComponent(query || "")),
        getUserProfile: (id) => request(`/api/users/${id}`),

        // --- Requests ---
        sendRequest: (receiverId, message, skill, rating) =>
            request("/api/requests", {
                method: "POST",
                body: JSON.stringify({ receiver_id: receiverId, message, skill, rating }),
            }),
        listRequests: (params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.set("status", params.status);
            if (params.direction) query.set("direction", params.direction);
            const qs = query.toString();
            return request("/api/requests" + (qs ? `?${qs}` : ""));
        },
        getConnections: () => request("/api/requests/connections"),
        acceptRequest: (id) =>
            request(`/api/requests/${id}/accept`, { method: "PATCH" }),
        rejectRequest: (id) =>
            request(`/api/requests/${id}/reject`, { method: "PATCH" }),
        cancelRequest: (id) =>
            request(`/api/requests/${id}`, { method: "DELETE" }),

        // --- Conversations & Messages ---
        getConversations: () => request("/api/conversations"),
        getConversation: (id) => request(`/api/conversations/${id}`),
        getMessages: (conversationId) =>
            request(`/api/conversations/${conversationId}/messages`),
        sendMessage: (conversationId, content) =>
            request(`/api/conversations/${conversationId}/messages`, {
                method: "POST",
                body: JSON.stringify({ content }),
            }),

        // --- Projects (PostgreSQL backed) ---
        getMyProjects: () => request("/api/users/me/projects"),
        getUserProjects: (userId) => request(`/api/users/${userId}/projects`),
        listProjects: (ownerId) =>
            request("/api/projects" + (ownerId ? `?owner_id=${ownerId}` : "")),
        createProject: (data) =>
            request("/api/projects", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),

        // --- Activity Timeline (PostgreSQL events) ---
        getMyActivity: () => request("/api/users/me/activity"),
        getUserActivity: (userId) => request(`/api/users/${userId}/activity`),

                // --- Learning Progress (PostgreSQL) ---
        getMyLearning: () => request("/api/users/me/learning"),
        getUserLearning: (userId) => request(`/api/users/${userId}/learning`),
        addOrUpdateLearning: (data) =>
            request("/api/users/me/learning", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),

        // --- Learning Resources (curated, from trusted providers) ---
        getLearningSkills: () => request("/api/learning-resources/skills"),
        getLearningProviders: () => request("/api/learning-resources/providers"),
        getLearningResources: (params = {}) => {
            const query = new URLSearchParams();
            if (params.skill) query.set("skill", params.skill);
            if (params.resource_type) query.set("resource_type", params.resource_type);
            if (params.difficulty) query.set("difficulty", params.difficulty);
            if (params.provider) query.set("provider", params.provider);
            if (params.search) query.set("search", params.search);
            const qs = query.toString();
            return request("/api/learning-resources" + (qs ? `?${qs}` : ""));
        },
        getLearningResource: (id) => request(`/api/learning-resources/${id}`),
    };
})();

