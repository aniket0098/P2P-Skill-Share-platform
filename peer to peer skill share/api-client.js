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

        // Append a skill to the AUTHENTICATED user's own
        // profile (backend derives the user from the JWT).
        addMySkill: (name) =>
            request("/api/users/me/skills", {
                method: "PATCH",
                body: JSON.stringify({ name }),
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
    };
})();
