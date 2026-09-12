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
        signup: (name, email, password, extra) =>
            request("/signup", {
                method: "POST",
                body: JSON.stringify({ name, email, password, ...(extra || {}) }),
            }),
        requestAdminAccess: (data) =>
            request("/admin/requests", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        getMe: () => request("/me"),
        getDashboard: () => request("/api/dashboard"),

        // Phase 2: role-based profile (backend source of truth).
        getMyRoleProfile: () => request("/profile/me"),
        updateMyRoleProfile: (data) =>
            request("/profile/me", {
                method: "PUT",
                body: JSON.stringify(data || {}),
            }),

        // --- Profile completion ---
        getProfileCompletion: () => request("/api/profile/completion"),

        // --- Education (CRUD, JWT-authenticated) ---
        getEducation: () => request("/api/profile/education"),
        addEducation: (data) =>
            request("/api/profile/education", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        updateEducation: (id, data) =>
            request(`/api/profile/education/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),
        deleteEducation: (id) =>
            request(`/api/profile/education/${id}`, { method: "DELETE" }),

        // --- Skills (normalized, JWT-authenticated) ---
        getMySkills: () => request("/api/profile/skills"),
        addMySkill: (data) =>
            request("/api/profile/skills", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        updateMySkill: (id, data) =>
            request(`/api/profile/skills/${id}`, {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),
        deleteMySkill: (id) =>
            request(`/api/profile/skills/${id}`, { method: "DELETE" }),
        searchSkills: (q) =>
            request("/api/skills/catalog" + (q ? `?q=${encodeURIComponent(q)}` : "")),

        // --- Stage 5: skill mapping + industry insights (backend-owned) ---
        getIndustryDomains: () => request("/api/industry/domains"),
        getIndustryRoles: (params = {}) => {
            const query = new URLSearchParams();
            if (params.domain) query.set("domain", params.domain);
            if (params.search) query.set("search", params.search);
            const qs = query.toString();
            return request("/api/industry/roles" + (qs ? `?${qs}` : ""));
        },
        getIndustryRole: (id) => request(`/api/industry/roles/${id}`),
        getIndustrySkills: (params = {}) => {
            const query = new URLSearchParams();
            if (params.domain) query.set("domain", params.domain);
            if (params.category) query.set("category", params.category);
            if (params.demand) query.set("demand", params.demand);
            if (params.growth) query.set("growth", params.growth);
            if (params.search) query.set("search", params.search);
            if (params.limit) query.set("limit", params.limit);
            const qs = query.toString();
            return request("/api/industry/skills" + (qs ? `?${qs}` : ""));
        },
        getIndustryInsights: (params = {}) => {
            const query = new URLSearchParams();
            if (params.domain) query.set("domain", params.domain);
            if (params.limit) query.set("limit", params.limit);
            const qs = query.toString();
            return request("/api/industry/insights" + (qs ? `?${qs}` : ""));
        },
        searchSkillCatalog: (search, limit) => {
            const query = new URLSearchParams();
            if (search) query.set("search", search);
            if (limit) query.set("limit", limit);
            const qs = query.toString();
            return request("/api/skills" + (qs ? `?${qs}` : ""));
        },
        getSkillDetail: (id) => request(`/api/skills/${id}`),
        getSkillMapping: (params = {}) => {
            const query = new URLSearchParams();
            if (params.role_id) query.set("role_id", params.role_id);
            if (params.role) query.set("role", params.role);
            const qs = query.toString();
            return request("/api/skill-mapping/me" + (qs ? `?${qs}` : ""));
        },
        getSkillGap: (params = {}) => {
            const query = new URLSearchParams();
            if (params.role_id) query.set("role_id", params.role_id);
            if (params.role) query.set("role", params.role);
            const qs = query.toString();
            return request("/api/skill-gap/me" + (qs ? `?${qs}` : ""));
        },
        getSkillRecommendations: (params = {}) => {
            const query = new URLSearchParams();
            if (params.role_id) query.set("role_id", params.role_id);
            if (params.role) query.set("role", params.role);
            const qs = query.toString();
            return request("/api/skill-recommendations/me" + (qs ? `?${qs}` : ""));
        },
        analyzeMySkill: (params = {}) => {
            const query = new URLSearchParams();
            if (params.skill_id) query.set("skill_id", params.skill_id);
            if (params.skill) query.set("skill", params.skill);
            if (params.role_id) query.set("role_id", params.role_id);
            if (params.role) query.set("role", params.role);
            const qs = query.toString();
            return request("/api/skills/analyze/me" + (qs ? `?${qs}` : ""));
        },
        updateTargetRole: (data) =>
            request("/api/skill-mapping/target-role", {
                method: "PUT",
                body: JSON.stringify(data || {}),
            }),

        // Public, aggregated platform statistics (no auth required).
        getStats: () => request("/api/stats"),

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
        getProject: (id) => request(`/api/projects/${id}`),
        updateProject: (id, data) =>
            request(`/api/projects/${id}`, {
                method: "PUT",
                body: JSON.stringify(data || {}),
            }),
        deleteProject: (id) =>
            request(`/api/projects/${id}`, { method: "DELETE" }),

        // --- Learning Overview (Stage 6 aggregation) ---
        getLearningOverview: () => request("/api/learning/overview"),

        // --- Skill Evidence / Growth (Stage 6) ---
        getSkillEvidence: () => request("/api/skills/evidence"),
        getSkillEvidenceBySkill: (skillId) =>
            request(`/api/skills/evidence/${skillId}`),
        getSkillGrowth: () => request("/api/skills/growth"),

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

        // --- Industry Sandbox (Stage 7) ---
        getSandboxChallenges: (params = {}) => {
            const q = new URLSearchParams();
            if (params.search) q.set("search", params.search);
            if (params.domain) q.set("domain", params.domain);
            if (params.difficulty) q.set("difficulty", params.difficulty);
            if (params.status) q.set("status", params.status);
            if (params.skill) q.set("skill", params.skill);
            const qs = q.toString();
            return request("/api/sandbox/challenges" + (qs ? `?${qs}` : ""));
        },
        getSandboxChallenge: (id) => request(`/api/sandbox/challenges/${id}`),
        startSandboxChallenge: (id) =>
            request(`/api/sandbox/challenges/${id}/start`, { method: "POST" }),
        getMySandboxChallenges: () => request("/api/sandbox/my-challenges"),
        getMySandboxChallenge: (id) => request(`/api/sandbox/my-challenges/${id}`),
        getSandboxWorkspace: (id) => request(`/api/sandbox/workspace/${id}`),
        saveSandboxDraft: (id, data) =>
            request(`/api/sandbox/workspace/${id}/draft`, {
                method: "PUT", body: JSON.stringify(data || {}),
            }),
        submitSandbox: (id, data) =>
            request(`/api/sandbox/workspace/${id}/submit`, {
                method: "POST", body: JSON.stringify(data || {}),
            }),
        getSandboxSubmission: (id) => request(`/api/sandbox/submissions/${id}`),
        evaluateSandboxSubmission: (id, data) =>
            request(`/api/sandbox/submissions/${id}/evaluate`, {
                method: "POST", body: JSON.stringify(data || {}),
            }),
        getSandboxDashboard: () => request("/api/sandbox/dashboard"),
        getSandboxRecommendations: () => request("/api/sandbox/recommendations"),
    };
})();

