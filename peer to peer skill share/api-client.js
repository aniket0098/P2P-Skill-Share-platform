/* SkillShare frontend API handoff for the upcoming FastAPI backend.
   No passwords, database credentials, or tokens belong in this file. */
window.SkillShareAPI = (() => {
    const baseUrl = window.SKILLSHARE_API_BASE || "http://127.0.0.1:8000/api/v1";
    async function request(path, options = {}) {
        const response = await fetch(`${baseUrl}${path}`, {
            headers: { "Content-Type": "application/json", ...options.headers },
            credentials: "include",
            ...options
        });
        if (!response.ok) throw new Error(`SkillShare API request failed: ${response.status}`);
        return response.status === 204 ? null : response.json();
    }
    return {
        baseUrl,
        getMyProfile: () => request("/users/me"),
        updateMyProfile: data => request("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
        listSkills: query => request(`/skills${query ? `?q=${encodeURIComponent(query)}` : ""}`),
        createSession: data => request("/sessions", { method: "POST", body: JSON.stringify(data) }),
        listRequests: () => request("/session-requests"),
        respondToRequest: (id, status) => request(`/session-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    };
})();
