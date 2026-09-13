/* My Learning Core System - JavaScript */
(function() {
    const API = window.SkillShareAPI;
    if (!API) return;

    let allRecords = [];
    let currentFilter = "all";
    let searchQuery = "";
    let activeTimeTracker = null;
    let activeRecordId = null;

    // Toast system
    function showToast(message, duration) {
        const toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => toast.classList.remove("show"), duration || 2600);
    }
    window.showToast = showToast;

    // Format helpers
    function fmtTime(seconds) {
        const s = Number(seconds || 0);
        if (s < 60) return "0m";
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        if (h > 0) return m ? h + "h " + m + "m" : h + "h";
        return m + "m";
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function timeAgo(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return "just now";
        if (diff < 3600) return Math.floor(diff / 60) + "m ago";
        if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
        return Math.floor(diff / 86400) + "d ago";
    }

    function statusLabel(status) {
        if (status === "completed") return "Completed";
        if (status === "in_progress") return "In Progress";
        return "Not Started";
    }

    function statusClass(status) {
        if (status === "completed") return "status-completed";
        if (status === "in_progress") return "status-in_progress";
        return "status-started";
    }

    // Visibility helpers
    function showEl(id) { const el = document.getElementById(id); if (el) el.style.display = ""; }
    function hideEl(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

    // Render overview stats
    function renderStats(stats) {
        document.getElementById("statOverallProgress").textContent = stats.total ? stats.average_progress + "%" : "—";
        document.getElementById("statActive").textContent = stats.active || 0;
        document.getElementById("statCompleted").textContent = stats.completed || 0;
        document.getElementById("statTime").textContent = stats.total_time_formatted || "0m";
        document.getElementById("statSkills").textContent = stats.skills_developing || 0;
        document.getElementById("statStreak").textContent = stats.current_streak || 0;
    }

    // Render active learning list
    function renderActiveLearning(records) {
        const host = document.getElementById("activeLearningList");
        if (!host) return;
        const active = records.filter(r => r.status === "started" || r.status === "in_progress");
        const badge = document.getElementById("activeCount");
        if (badge) badge.textContent = active.length;
        if (!active.length) {
            host.innerHTML = '<div class="empty-msg">No active learning. <a href="explore.html" style="color:var(--primary2)">Find a resource to start.</a></div>';
            return;
        }
        host.innerHTML = active.slice(0, 5).map(r => {
            const pct = Math.max(0, Math.min(100, Number(r.progress || 0)));
            return '<div class="learning-item" data-id="' + r.id + '">' +
                '<div class="learning-info">' +
                    '<div class="learning-title">' + escapeHtml(r.resource_title || "Learning resource") + '</div>' +
                    '<div class="learning-meta">' +
                        '<span class="skill-tag">' + escapeHtml(r.skill_name || "General") + '</span>' +
                        '<span>' + escapeHtml(r.resource_type || "resource") + '</span>' +
                        '<span>' + timeAgo(r.last_accessed) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="learning-progress">' +
                    '<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="progress-label">' + pct + '%</div>' +
                '</div>' +
                '<div class="learning-actions">' +
                    '<button class="btn-sm btn-continue" data-action="continue" data-id="' + r.id + '" data-url="' + escapeHtml(r.resource_url || "#") + '">Continue</button>' +
                '</div>' +
            '</div>';
        }).join("");
    }

    // Render weekly chart
    function renderChart(weekly) {
        const host = document.getElementById("weeklyChart");
        if (!host) return;
        const data = weekly || [];
        const maxMin = Math.max.apply(null, data.map(function(d) { return d.minutes; }).concat([1]));
        host.innerHTML = data.map(function(d) {
            const pct = Math.max(4, Math.round((d.minutes / maxMin) * 100));
            return '<div class="chart-bar-group"><div class="chart-bar" style="height:' + pct + '%;" title="' + d.minutes + ' min"></div><div class="chart-bar-label">' + d.day + '</div></div>';
        }).join("");
    }

    // Render skills progress
    function renderSkillsProgress(records) {
        const host = document.getElementById("skillsProgressList");
        if (!host) return;
        const bySkill = {};
        records.forEach(function(r) {
            const key = (r.skill_name || "General").trim() || "General";
            if (!bySkill[key]) bySkill[key] = { total: 0, sum: 0 };
            bySkill[key].total++;
            bySkill[key].sum += Number(r.progress || 0);
        });
        const skills = Object.keys(bySkill).map(function(name) {
            return { name: name, avg: Math.round(bySkill[name].sum / bySkill[name].total), count: bySkill[name].total };
        }).sort(function(a, b) { return b.avg - a.avg; });
        if (!skills.length) {
            host.innerHTML = '<div class="empty-msg">No skills being developed yet.</div>';
            return;
        }
        host.innerHTML = skills.slice(0, 6).map(function(s) {
            return '<div class="skill-progress-row">' +
                '<div class="skill-progress-head"><span>' + escapeHtml(s.name) + '</span><span>' + s.avg + '%</span></div>' +
                '<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:' + s.avg + '%"></div></div>' +
                '<small>' + s.count + ' resource' + (s.count > 1 ? 's' : '') + '</small>' +
            '</div>';
        }).join("");
    }

    // Render milestones
    function renderMilestones(milestones) {
        const host = document.getElementById("milestonesList");
        if (!host) return;
        const items = milestones || [];
        if (!items.length) {
            host.innerHTML = '<div class="empty-msg">Complete learning to earn milestones.</div>';
            return;
        }
        host.innerHTML = items.map(function(m) {
            return '<div class="milestone-row">' +
                '<div class="milestone-dot"></div>' +
                '<div class="milestone-info">' +
                    '<div class="milestone-title">' + escapeHtml(m.resource_title || "Completed") + '</div>' +
                    '<div class="milestone-skill">' + escapeHtml(m.skill_name || "") + (m.completed_at ? " · " + timeAgo(m.completed_at) : "") + '</div>' +
                '</div>' +
            '</div>';
        }).join("");
    }

    // Render history with filter/search
    function renderHistory() {
        const host = document.getElementById("historyList");
        if (!host) return;
        let items = allRecords.slice();
        if (currentFilter !== "all") {
            items = items.filter(function(r) { return r.status === currentFilter; });
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            items = items.filter(function(r) {
                return (r.resource_title || "").toLowerCase().indexOf(q) >= 0 ||
                       (r.skill_name || "").toLowerCase().indexOf(q) >= 0;
            });
        }
        if (!items.length) {
            host.innerHTML = '<div class="empty-msg">No records match your search.</div>';
            return;
        }
        host.innerHTML = items.slice(0, 20).map(function(r) {
            const pct = Math.max(0, Math.min(100, Number(r.progress || 0)));
            return '<div class="history-row">' +
                '<div class="history-info">' +
                    '<div class="history-title">' + escapeHtml(r.resource_title || "Learning resource") + '</div>' +
                    '<div class="history-meta"><span class="skill-tag">' + escapeHtml(r.skill_name || "General") + '</span> · ' + escapeHtml(r.resource_type || "resource") + ' · ' + fmtTime(r.time_spent_seconds) + '</div>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<span class="status-badge ' + statusClass(r.status) + '">' + statusLabel(r.status) + '</span>' +
                    '<span style="font-size:12px;color:var(--muted);min-width:36px;text-align:right;">' + pct + '%</span>' +
                '</div>' +
            '</div>';
        }).join("");
    }

    // Load all data
    async function loadData() {
        try {
            const results = await Promise.all([
                API.getLearningStats().catch(function() { return null; }),
                API.getMyLearningRecords().catch(function() { return null; })
            ]);
            const statsRes = results[0];
            const recordsRes = results[1];

            hideEl("learningLoading");

            if (!statsRes || !recordsRes) {
                showEl("learningError");
                const msg = document.getElementById("learningErrorMsg");
                if (msg) msg.textContent = "Could not load learning data from the server.";
                return;
            }

            const stats = statsRes;
            allRecords = (recordsRes.records || []).map(function(r) {
                var rec = Object.assign({}, r);
                rec.progress = r.progress || 0;
                return rec;
            });

            if (!stats.has_activity) {
                showEl("learningEmpty");
                return;
            }

            showEl("learningDashboard");
            renderStats(stats);
            renderActiveLearning(allRecords);
            renderChart(stats.weekly_time || []);
            renderSkillsProgress(allRecords);
            renderMilestones(stats.recent_milestones || []);
            renderHistory();

            var wt = document.getElementById("weeklyTotal");
            if (wt) {
                var totalMin = (stats.weekly_time || []).reduce(function(a, b) { return a + b.minutes; }, 0);
                wt.textContent = totalMin + " min this week";
            }
            var cr = document.getElementById("completionRate");
            if (cr) cr.textContent = (stats.completion_rate || 0) + "% completion rate";

            var firstActive = null;
            for (var i = 0; i < allRecords.length; i++) {
                if (allRecords[i].status !== "completed") { firstActive = allRecords[i]; break; }
            }
            if (firstActive) startTimeTracking(firstActive.id);

        } catch (err) {
            hideEl("learningLoading");
            showEl("learningError");
            const msg = document.getElementById("learningErrorMsg");
            if (msg) msg.textContent = err.message || "An unexpected error occurred.";
        }
    }

    // Time tracking
    function startTimeTracking(recordId) {
        if (activeTimeTracker) clearInterval(activeTimeTracker);
        activeRecordId = recordId;
        activeTimeTracker = setInterval(function() {
            if (activeRecordId) {
                API.addLearningTime(activeRecordId, 60).catch(function() {});
            }
        }, 60000);
    }

    function stopTimeTracking() {
        if (activeTimeTracker) { clearInterval(activeTimeTracker); activeTimeTracker = null; }
        activeRecordId = null;
    }

    // Update progress
    async function updateProgress(recordId, progress) {
        try {
            const result = await API.updateLearningProgress(recordId, progress);
            if (result && result.record) {
                for (var i = 0; i < allRecords.length; i++) {
                    if (allRecords[i].id === recordId) {
                        allRecords[i] = Object.assign({}, allRecords[i], result.record, { progress: result.record.progress });
                        break;
                    }
                }
                renderActiveLearning(allRecords);
                renderHistory();
                renderSkillsProgress(allRecords);
                showToast(result.message || "Progress updated");
                if (result.was_completed) {
                    showToast("Congratulations! Resource completed!", 3500);
                    loadData();
                }
            }
        } catch (err) {
            showToast("Failed to update progress: " + (err.message || "Unknown error"));
        }
    }

    // Event delegation
    document.addEventListener("click", function(e) {
        var btn = e.target.closest("[data-action='continue']");
        if (btn) {
            var id = parseInt(btn.dataset.id);
            var url = btn.dataset.url;
            var record = null;
            for (var i = 0; i < allRecords.length; i++) {
                if (allRecords[i].id === id) { record = allRecords[i]; break; }
            }
            if (record) {
                showToast("Opening resource...");
                if (url && url !== "#" && url.indexOf("http") === 0) {
                    window.open(url, "_blank", "noopener");
                } else {
                    showToast("Resource link not available. Check Explore Skills.");
                }
                startTimeTracking(id);
                if (record.progress < 100) {
                    var newPct = Math.min(100, record.progress + 5);
                    updateProgress(id, newPct);
                }
            }
        }
    });

    // Filter buttons
    document.addEventListener("click", function(e) {
        var filterBtn = e.target.closest(".filter-btn");
        if (filterBtn) {
            var btns = document.querySelectorAll(".filter-btn");
            for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
            filterBtn.classList.add("active");
            currentFilter = filterBtn.dataset.filter || "all";
            renderHistory();
        }
    });

    // Search input
    var searchInput = document.getElementById("learningSearch");
    if (searchInput) {
        var searchTimeout;
        searchInput.addEventListener("input", function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(function() {
                searchQuery = searchInput.value.trim();
                renderHistory();
            }, 250);
        });
    }

    // Auth expired handling
    window.addEventListener("skillshare:auth-expired", function() {
        stopTimeTracking();
        hideEl("learningDashboard");
        hideEl("learningEmpty");
        showEl("learningError");
        var msg = document.getElementById("learningErrorMsg");
        if (msg) msg.textContent = "Session expired. Please log in again.";
    });

    // Cleanup on page unload
    window.addEventListener("beforeunload", stopTimeTracking);

    // Auth guard + boot
    if (!API.getToken()) {
        hideEl("learningLoading");
        showEl("learningError");
        var msg = document.getElementById("learningErrorMsg");
        if (msg) msg.textContent = "Please log in to view your learning data.";
        return;
    }

    document.addEventListener("DOMContentLoaded", function() {
        setTimeout(loadData, 200);
    });
})();
