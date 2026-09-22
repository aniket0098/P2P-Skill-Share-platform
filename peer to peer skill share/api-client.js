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

    // Multipart request wrapper (file uploads) — does not force JSON headers.
    async function requestForm(path, formData) {
        const headers = {};
        const token = getToken();
        if (token) headers["Authorization"] = "Bearer " + token;
        let response;
        try {
            response = await fetch(baseUrl + path, {
                method: "POST",
                headers,
                body: formData,
                credentials: "include",
            });
        } catch (error) {
            const networkError = new Error("Server unavailable. Please check that the backend is running.");
            networkError.status = 0;
            throw networkError;
        }
        if (response.status === 401) {
            clearSession();
            window.dispatchEvent(new CustomEvent("skillshare:auth-expired", { detail: { status: 401 } }));
        }
        if (!response.ok) {
            let detail = null;
            let body = null;
            try { body = await response.json(); } catch (error) { /* ignore */ }
            if (body) detail = body.detail || body.message || null;
            const error = new Error(detail || `Request failed (${response.status})`);
            error.status = response.status;
            error.detail = detail;
            throw error;
        }
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

        // --- Explore Skills catalog (public discovery; personal fields when JWT present) ---
        getLearningCatalog: () => request("/api/learning/catalog"),
        getLearningCourse: (key) => request(`/api/learning/courses/${encodeURIComponent(key)}`),
        getLearningResource: (id) => request(`/api/learning/resources/${id}`),
        startLearning: (resourceId) =>
            request(`/api/learning/start/${resourceId}`, { method: "POST" }),
        saveWatchProgress: (recordId, data) =>
            request(`/api/learning/${recordId}/watch`, {
                method: "POST", body: JSON.stringify(data || {}),
            }),
        // Persist the REAL runtime duration read from the actual media player
        // for resources that have no pre-seeded duration (YouTube lectures).
        initLearningRecord: (recordId, durationSeconds) =>
            request(`/api/learning/${recordId}/init`, {
                method: "POST",
                body: JSON.stringify({ duration_seconds: durationSeconds }),
            }),
        getLearningBookmarks: () => request("/api/learning/bookmarks"),
        addLearningBookmark: (resourceId) =>
            request(`/api/learning/bookmarks/${resourceId}`, { method: "POST" }),
        removeLearningBookmark: (resourceId) =>
            request(`/api/learning/bookmarks/${resourceId}`, { method: "DELETE" }),

        // (Duplicate getMe removed: the canonical getMe above returns the
        // live user object; a second definition here overwrote it and
        // broke messages.js state.me.id comparisons.)

        // Update the AUTHENTICATED user's own profile. The user is
        // derived from the JWT server-side; no user_id is sent.
        updateMyProfile: (data) =>
            request("/api/users/me", {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),

        // --- Users ---
        listUsers: () => request("/api/users"),
        searchUsers: (query, limit, options = {}) => {
            const params = new URLSearchParams();
            params.set("q", query || "");
            // Keep type-ahead dropdown small/fast; backend caps at 50.
            params.set("limit", String(limit || 8));
            return request(`/api/users/search?${params.toString()}`, {
                signal: options.signal,
            });
        },
        getUserProfile: (id, options = {}) =>
            request(`/api/users/${id}`, { signal: options.signal }),

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
        removeConnection: (userId) =>
            request(`/api/connections/${userId}`, { method: "DELETE" }),
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

        // --- My Learning canonical overview (one efficient call) ---
        getLearningMe: () => request("/api/learning/me"),
        getLearningHistory: (params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.set("status", params.status);
            if (params.skill) query.set("skill", params.skill);
            if (params.q) query.set("q", params.q);
            if (params.sort) query.set("sort", params.sort);
            const qs = query.toString();
            return request("/api/learning/history" + (qs ? `?${qs}` : ""));
        },
        getLearningRecommendations: (limit) =>
            request(`/api/learning/recommendations${limit ? "?limit=" + limit : ""}`),
        getLearningRoadmap: () => request("/api/learning/roadmap"),
        getLearningActivity: (limit) =>
            request(`/api/learning/activity${limit ? "?limit=" + limit : ""}`),

        // --- My Learning Core System ---
        getMyLearningRecords: () => request("/api/learning/me"),
        getActiveLearning: () => request("/api/learning/active"),
        getCompletedLearning: () => request("/api/learning/completed"),
        getLearningStats: () => request("/api/learning/stats"),
        updateLearningProgress: (recordId, progress, extra = {}) =>
            request(`/api/learning/${recordId}/progress`, {
                method: "PATCH",
                body: JSON.stringify({ progress_percentage: progress, ...(extra || {}) }),
            }),
        addLearningTime: (recordId, seconds) =>
            request(`/api/learning/${recordId}/time`, {
                method: "PATCH",
                body: JSON.stringify({ seconds }),
            }),
        startLearning: (resourceId) =>
            request(`/api/learning/start/${resourceId}`, { method: "POST" }),

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

        // --- AI Career Coach (Stage 9) ---
        getCareerCoachStatus: () => request("/api/career-coach/status"),
        getCareerContext: () => request("/api/career-coach/context"),
        getCareerRecommendations: () => request("/api/career-coach/recommendations"),
        getNextMission: () => request("/api/career-coach/next-mission"),
        getWeeklyPlan: () => request("/api/career-coach/weekly-plan"),
        getCareerRoadmap: () => request("/api/career-coach/roadmap"),
        careerCoachChat: (data) =>
            request("/api/career-coach/chat", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        getCoachConversations: () => request("/api/career-coach/conversations"),
        getCoachConversation: (id) => request(`/api/career-coach/conversations/${id}`),
        createCoachConversation: (data) =>
            request("/api/career-coach/conversations", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        deleteCoachConversation: (id) =>
            request(`/api/career-coach/conversations/${id}`, { method: "DELETE" }),

        // --- CareerVerse (Stage 10) ---
        getCareerOverview: () => request("/api/careerverse/overview"),
        getCareerTimeline: (limit) =>
            request(`/api/careerverse/timeline${limit ? "?limit=" + limit : ""}`),
        getCareerRoadmap: () => request("/api/careerverse/roadmap"),
        getCareerNextMission: () => request("/api/careerverse/next-mission"),
        getCareerGoals: () => request("/api/careerverse/goals"),
        setCareerGoal: (data) =>
            request("/api/careerverse/goals", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        simulate: (data) =>
            request("/api/careerverse/simulate", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),

        // =====================================================
        // --- Communication Hub (Messages rebuild) ---
        // Realtime + groups + reactions + attachments + calls.
        // All endpoints are JWT-protected; membership enforced
        // server-side (comm_api.py).
        // =====================================================
        commListConversations: () => request("/api/communication/conversations"),
        commGetConversation: (id) => request(`/api/communication/conversations/${id}`),
        commEnsureDirect: (userId) =>
            request(`/api/communication/direct/${userId}`, { method: "POST" }),
        commCreateGroup: (data) =>
            request("/api/communication/groups", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        commPatchGroup: (conversationId, data) =>
            request(`/api/communication/groups/${conversationId}`, {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),
        commAddMembers: (conversationId, userIds) =>
            request(`/api/communication/groups/${conversationId}/members`, {
                method: "POST",
                body: JSON.stringify({ user_ids: userIds || [] }),
            }),
        commRemoveMember: (conversationId, userId) =>
            request(`/api/communication/groups/${conversationId}/members/${userId}`, { method: "DELETE" }),
        commPromoteAdmin: (conversationId, userId) =>
            request(`/api/communication/groups/${conversationId}/admins/${userId}`, { method: "POST" }),
        commDemoteAdmin: (conversationId, userId) =>
            request(`/api/communication/groups/${conversationId}/admins/${userId}`, { method: "DELETE" }),
        commGetMessages: (conversationId, beforeId) =>
            request(`/api/communication/conversations/${conversationId}/messages` +
                (beforeId ? `?before_id=${beforeId}` : "")),
        commSendMessage: (conversationId, content, replyToId) =>
            request(`/api/communication/conversations/${conversationId}/messages`, {
                method: "POST",
                body: JSON.stringify({ content, reply_to_id: replyToId || null }),
            }),
        commEditMessage: (messageId, content) =>
            request(`/api/communication/messages/${messageId}`, {
                method: "PATCH",
                body: JSON.stringify({ content }),
            }),
        commDeleteMessage: (messageId) =>
            request(`/api/communication/messages/${messageId}`, { method: "DELETE" }),
        commToggleReaction: (messageId, emoji) =>
            request(`/api/communication/messages/${messageId}/reactions`, {
                method: "POST",
                body: JSON.stringify({ emoji }),
            }),
        commPinMessage: (messageId) =>
            request(`/api/communication/messages/${messageId}/pin`, { method: "POST" }),
        commForwardMessage: (messageId, conversationId) =>
            request(`/api/communication/messages/${messageId}/forward`, {
                method: "POST",
                body: JSON.stringify({ conversation_id: conversationId }),
            }),
        commSetPreferences: (conversationId, data) =>
            request(`/api/communication/conversations/${conversationId}/preferences`, {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),
        commMarkRead: (conversationId) =>
            request(`/api/communication/conversations/${conversationId}/read`, { method: "POST" }),
        commSearch: (q, limit) =>
            request(`/api/communication/search?q=${encodeURIComponent(q || "")}` +
                (limit ? `&limit=${limit}` : "")),
        commGetMedia: (conversationId) =>
            request(`/api/communication/conversations/${conversationId}/media`),
        commPeople: (q, limit) =>
            request(`/api/communication/people?q=${encodeURIComponent(q || "")}` +
                (limit ? `&limit=${limit}` : "")),
        commUserProfile: (userId) => request(`/api/communication/users/${userId}`),
        commUploadAttachment: (conversationId, file) => {
            const fd = new FormData();
            fd.append("file", file);
            return requestForm(`/api/communication/conversations/${conversationId}/attachments`, fd);
        },
        attachmentUrl: (pathOrUrl) => {
            if (!pathOrUrl) return "";
            if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
            if (pathOrUrl.startsWith("/")) return baseUrl + pathOrUrl;
            return pathOrUrl;
        },
        commCalls: (limit) =>
            request(`/api/communication/calls${limit ? `?limit=${limit}` : ""}`),
        commStartCall: (conversationId, callType) =>
            request(`/api/communication/conversations/${conversationId}/calls`, {
                method: "POST",
                body: JSON.stringify({ call_type: callType || "voice" }),
            }),
        commUpdateCall: (callId, status, durationSeconds) =>
            request(`/api/communication/calls/${callId}`, {
                method: "POST",
                body: JSON.stringify({
                    status,
                    duration_seconds: durationSeconds == null ? null : durationSeconds,
                }),
            }),
        commPresence: (userIds) =>
            request(`/api/communication/presence?user_ids=${encodeURIComponent((userIds || []).join(","))}`),
        commWsUrl: () => {
            const wsBase = baseUrl.replace(/^http/i, "ws");
            return `${wsBase}/ws/communication?token=${encodeURIComponent(getToken() || "")}`;
        },

        /* =====================================================
           LIVE DISCUSSIONS — room discovery + room lifecycle
           All calls are JWT-protected; the backend derives the
           current user from the token (never a body user_id).
           ===================================================== */
        listDiscussions: (params = {}) => {
            const qs = new URLSearchParams();
            if (params.q) qs.set("q", params.q);
            if (params.category) qs.set("category", params.category);
            if (params.status) qs.set("status", params.status);
            if (params.filter && params.filter !== "all") qs.set("filter", params.filter);
            if (params.limit) qs.set("limit", params.limit);
            const suffix = qs.toString() ? `?${qs.toString()}` : "";
            return request(`/api/discussions${suffix}`);
        },
        createDiscussion: (data) =>
            request("/api/discussions", {
                method: "POST",
                body: JSON.stringify(data),
            }),
        getDiscussion: (roomId) => request(`/api/discussions/${roomId}`),
        updateDiscussion: (roomId, data) =>
            request(`/api/discussions/${roomId}`, {
                method: "PATCH",
                body: JSON.stringify(data),
            }),
        startDiscussion: (roomId) =>
            request(`/api/discussions/${roomId}/start`, { method: "POST" }),
        endDiscussion: (roomId) =>
            request(`/api/discussions/${roomId}/end`, { method: "POST" }),
        cancelDiscussion: (roomId) =>
            request(`/api/discussions/${roomId}/cancel`, { method: "POST" }),
        joinDiscussion: (roomId) =>
            request(`/api/discussions/${roomId}/join`, { method: "POST" }),
        leaveDiscussion: (roomId) =>
            request(`/api/discussions/${roomId}/leave`, { method: "POST" }),
        /* Private-room join requests (additive; existing contracts untouched). */
        requestDiscussionJoin: (roomId) =>
            request(`/api/discussions/${roomId}/request`, { method: "POST" }),
        getDiscussionJoinRequests: (roomId, status = "pending") =>
            request(`/api/discussions/${roomId}/requests?status=${encodeURIComponent(status)}`),
        acceptDiscussionJoinRequest: (roomId, requestId) =>
            request(`/api/discussions/${roomId}/requests/${requestId}/accept`, { method: "POST" }),
        rejectDiscussionJoinRequest: (roomId, requestId) =>
            request(`/api/discussions/${roomId}/requests/${requestId}/reject`, { method: "POST" }),
        getDiscussionParticipants: (roomId) =>
            request(`/api/discussions/${roomId}/participants`),
        removeDiscussionParticipant: (roomId, userId) =>
            request(`/api/discussions/${roomId}/participants/${userId}`, {
                method: "DELETE",
            }),
        getDiscussionMessages: (roomId, beforeId, limit = 30) =>
            request(
                `/api/discussions/${roomId}/messages?limit=${limit}` +
                    (beforeId ? `&before_id=${beforeId}` : "")
            ),
        sendDiscussionMessage: (roomId, content) =>
            request(`/api/discussions/${roomId}/messages`, {
                method: "POST",
                body: JSON.stringify({ content }),
            }),
        getDiscussionResources: (roomId) =>
            request(`/api/discussions/${roomId}/resources`),
        addDiscussionResource: (roomId, data) =>
            request(`/api/discussions/${roomId}/resources`, {
                method: "POST",
                body: JSON.stringify(data),
            }),
        discussionWsUrl: (roomId) => {
            const wsBase = baseUrl.replace(/^http/i, "ws");
            return `${wsBase}/ws/discussions/${roomId}?token=${encodeURIComponent(getToken() || "")}`;
        },
        /* LiveKit Cloud: short-lived participant token for the SAME
           application room (JWT auth; server enforces membership + cap).
           Never exposes API key/secret. */
        getLivekitToken: (roomId) =>
            request("/api/livekit/token", {
                method: "POST",
                body: JSON.stringify({ room_id: Number(roomId) }),
            }),
        /* Credits: PostgreSQL is the ONLY source of truth for the balance —
           the frontend never writes it. /api/credits also performs the lazy
           server-side daily renewal, so it is the canonical wallet read. */
        getCredits: () => request("/api/credits"),
        getCreditsHistory: (filter = "all", limit = 100, offset = 0) =>
            request(
                `/api/credits/history?filter=${encodeURIComponent(filter)}` +
                    `&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
            ),
        getCreditPackages: () => request("/api/credits/packages"),
        /* Returns 202 with no credits allocated until a payment provider is
           configured — the server decides, never the browser. */
        purchaseCredits: (packageKey, clientRequestId) =>
            request("/api/credits/purchase", {
                method: "POST",
                body: JSON.stringify({
                    package_key: packageKey,
                    client_request_id: clientRequestId,
                }),
            }),

        /* --- Student applications (Stage 2.5C) ---
           JWT-only: the backend derives the student from the token;
           no student/user ids are ever sent from the frontend.
           Additive only — existing contracts untouched. */
        /* GET /api/applications/me — the JWT student's own applications
           (status/limit/offset are optional). Returns
           { applications|items, total, limit, offset, has_more }. */
        getMyApplications: (params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.set("status", params.status);
            if (params.limit) query.set("limit", String(params.limit));
            if (params.offset) query.set("offset", String(params.offset));
            const qs = query.toString();
            return request("/api/applications/me" + (qs ? `?${qs}` : ""));
        },
        /* POST /api/applications/{id}/withdraw — owner only,
           applied -> withdrawn (401/403/404/409 handled by caller). */
        withdrawApplication: (applicationId) =>
            request(`/api/applications/${encodeURIComponent(applicationId)}/withdraw`, {
                method: "POST",
            }),

        /* --- Stage 2.9: student apply (opportunity details page) ---
           POST /api/opportunities/{id}/apply — student-only. Identity,
           eligibility, deadline, opportunity state and duplicate protection
           are ALL decided server-side from the JWT; the only student-settable
           field is the optional cover_note (backend caps it at 2000 chars).
           No student/user ids are ever sent from the frontend. */
        applyToOpportunity: (opportunityId, payload) =>
            request(`/api/opportunities/${encodeURIComponent(opportunityId)}/apply`, {
                method: "POST",
                body: JSON.stringify(payload || {}),
            }),

        /* --- Recruiter opportunities (Stage 2.6) ---
           JWT-only: the backend derives the owning recruiter from the
           token and derives the company from RecruiterProfile.
           Never send owner_user_id / recruiter_user_id / company_name
           as ownership. Additive only — existing contracts untouched. */
        /* POST /api/opportunities — recruiter-only, creates status=draft. */
        createOpportunity: (data) =>
            request("/api/opportunities", {
                method: "POST",
                body: JSON.stringify(data || {}),
            }),
        /* GET /api/opportunities/mine — owning recruiter's list. */
        getMyOpportunities: (params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.set("status", params.status);
            if (params.limit) query.set("limit", String(params.limit));
            if (params.offset) query.set("offset", String(params.offset));
            const qs = query.toString();
            return request("/api/opportunities/mine" + (qs ? `?${qs}` : ""));
        },
        /* GET /api/opportunities/{id} — recruiter reads own draft/detail. */
        getOpportunity: (id) =>
            request(`/api/opportunities/${encodeURIComponent(id)}`),
        /* PATCH /api/opportunities/{id} — owner-only partial update. */
        updateOpportunity: (id, data) =>
            request(`/api/opportunities/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: JSON.stringify(data || {}),
            }),
        /* PUT /api/opportunities/{id}/skills — full required-skill replacement. */
        replaceOpportunitySkills: (id, skills) =>
            request(`/api/opportunities/${encodeURIComponent(id)}/skills`, {
                method: "PUT",
                body: JSON.stringify({ skills: skills || [] }),
            }),
        /* POST /api/opportunities/{id}/publish — draft -> published. */
        publishOpportunity: (id) =>
            request(`/api/opportunities/${encodeURIComponent(id)}/publish`, {
                method: "POST",
            }),
        /* POST /api/opportunities/{id}/close — published -> closed. */
        closeOpportunity: (id) =>
            request(`/api/opportunities/${encodeURIComponent(id)}/close`, {
                method: "POST",
            }),
        /* POST /api/opportunities/{id}/archive — published|closed ->
           archived (Stage 9.2). Archived opportunities leave public
           discovery and cannot receive applications; their existing
           applications remain intact. Archived is terminal. */
        archiveOpportunity: (id) =>
            request(`/api/opportunities/${encodeURIComponent(id)}/archive`, {
                method: "POST",
            }),
        /* GET /api/opportunities/{id}/applications — Stage 9.3 recruiter
           applicant list (owner recruiter only; server-side authorization).
           Optional status/search filters + limit/offset pagination exactly
           as the backend accepts them (limit clamped 1..100 server-side). */
        getOpportunityApplications: (id, params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.set("status", params.status);
            if (params.search) query.set("search", params.search);
            if (params.limit) query.set("limit", String(params.limit));
            if (params.offset) query.set("offset", String(params.offset));
            const qs = query.toString();
            return request(
                `/api/opportunities/${encodeURIComponent(id)}/applications` + (qs ? `?${qs}` : "")
            );
        },
        /* PATCH /api/applications/{id}/status — Stage 9.3 recruiter status
           transition. Payload: { status, recruiter_note?, rejection_reason? }.
           Empty optional strings are OMITTED (an omitted recruiter_note
           preserves the previous note server-side; rejection_reason is
           required by the backend only when moving to "rejected"). Unknown
           fields are never sent — the backend forbids extras (422). */
        updateApplicationStatus: (id, payload = {}) => {
            const body = { status: payload.status };
            const note = payload.recruiter_note == null ? "" : String(payload.recruiter_note).trim();
            if (note) body.recruiter_note = note;
            const reason = payload.rejection_reason == null ? "" : String(payload.rejection_reason).trim();
            if (reason) body.rejection_reason = reason;
            return request(`/api/applications/${encodeURIComponent(id)}/status`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
        },
        /* DELETE /api/opportunities/{id} — owner only, DRAFT-only (backend
           answers 409 for published/closed). Additive Stage 2.7. */
        deleteOpportunity: (id) =>
            request(`/api/opportunities/${encodeURIComponent(id)}`, {
                method: "DELETE",
            }),
        /* GET /api/opportunities — published-only public discovery.
           Stage 2.8 (additive): + `search` (backend matches title,
           description, location) and + `company` (company_name ilike).
           Existing contract untouched. */
        listPublishedOpportunities: (params = {}) => {
            const query = new URLSearchParams();
            if (params.opportunity_type) query.set("opportunity_type", params.opportunity_type);
            if (params.work_mode) query.set("work_mode", params.work_mode);
            if (params.location) query.set("location", params.location);
            if (params.search) query.set("search", params.search);
            if (params.company) query.set("company", params.company);
            if (params.limit) query.set("limit", String(params.limit));
            if (params.offset) query.set("offset", String(params.offset));
            const qs = query.toString();
            return request("/api/opportunities" + (qs ? `?${qs}` : ""));
        },
        /* GET /api/opportunities/me/recommended — Stage 2.8 student
           discovery personalization. JWT-only: the backend resolves the
           student and computes eligibility + skill match server-side;
           the frontend never scores or filters eligibility itself. */
        getRecommendedOpportunities: (params = {}) => {
            const query = new URLSearchParams();
            if (params.opportunity_type) query.set("opportunity_type", params.opportunity_type);
            if (params.work_mode) query.set("work_mode", params.work_mode);
            if (params.location) query.set("location", params.location);
            if (params.search) query.set("search", params.search);
            if (params.company) query.set("company", params.company);
            if (params.limit) query.set("limit", String(params.limit));
            if (params.offset) query.set("offset", String(params.offset));
            const qs = query.toString();
            return request("/api/opportunities/me/recommended" + (qs ? `?${qs}` : ""));
        },
    };
})();

