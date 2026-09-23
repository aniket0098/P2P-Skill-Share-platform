/* =========================================================
   SKILLSHARE - SETTINGS (Stage 32 rebuild)
   Account & Platform Control Center

   Real-data only:
     GET    /me                    -> identity + account form
     PATCH  /api/users/me          -> account field saves
     PUT    /profile/me            -> career preferences
     GET    /api/settings          -> privacy + notification prefs
     PATCH  /api/settings          -> privacy + notification saves
     POST   /api/account/password  -> password change
     GET    /api/account/export    -> data export
     POST   /api/account/deactivate|reactivate|delete
   Appearance/accessibility are DEVICE preferences (localStorage via
   SkillShareUIPrefs) - never presented as account data.
   No request fires per keystroke: every section uses a controlled
   save bar with dirty tracking, validation and duplicate-submit lock.
   ========================================================= */
(function () {
    "use strict";

    /* =======================================================
       CONSTANTS
       ======================================================= */
    var SECTION_IDS = ["account", "security", "privacy", "notifications",
        "career", "appearance", "accessibility", "data", "danger"];

    /* Old page hashes keep working after the rebuild. */
    var LEGACY_HASH = {
        profileSettings: "account",
        accountSettings: "account",
        privacySettings: "privacy",
        notificationSettings: "notifications",
        appearanceSettings: "appearance",
        blockedSettings: "privacy",
        paymentSettings: "data",
        supportSettings: "data"
    };

    var USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
    var SAVE_DIRTY = { account: false, privacy: false, notifications: false, career: false };

    /* =======================================================
       STATE (all hydrated from real API responses)
       ======================================================= */
    var state = {
        user: null,
        role: "student",
        roleProfile: null,
        roleProfileError: null,
        settings: null,
        pendingAvatar: null,   /* dataURL staged for save; null = unchanged */
        avatarCleared: false,  /* user pressed Remove */
        booted: false,
        bound: false,
        modalsBound: false,
        saving: {}
    };
    var baseline = {
        account: null,
        privacy: null,
        notifications: null,
        career: null
    };

    /* =======================================================
       SMALL HELPERS
       ======================================================= */
    function $(id) { return document.getElementById(id); }

    function on(el, ev, fn) {
        if (el && el.addEventListener) el.addEventListener(ev, fn);
    }

    function all(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function normalizeRole(role) {
        var r = String(role || "student").trim().toLowerCase();
        if (["student", "recruiter", "mentor", "faculty", "admin", "tpo", "college",
            "college_placement", "learner"].indexOf(r) !== -1) return r;
        return "student";
    }

    function fmtDate(value) {
        if (!value) return "-";
        try {
            var d = new Date(value);
            if (isNaN(d.getTime())) return "-";
            return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        } catch (e) { return "-"; }
    }

    function initialsOf(name) {
        var parts = String(name || "").trim().split(/\s+/);
        var out = "";
        if (parts[0]) out += parts[0].charAt(0);
        if (parts[1]) out += parts[1].charAt(0);
        return (out || "?").toUpperCase();
    }

    var toastTimer = null;
    function toast(message, type) {
        var el = $("settingsToast");
        if (!el) return;
        el.hidden = false;
        el.className = "toast" + (type === "error" ? " is-error" :
            type === "success" ? " is-success" : "");
        el.textContent = String(message || "");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
    }

    function setStatus(section, message, kind) {
        var el = document.querySelector('[data-status-for="' + section + '"]');
        if (!el) return;
        el.className = "save-status" + (kind ? " is-" + kind : "");
        el.textContent = message || "";
    }

    function setBtnSaved(btn, doneLabel) {
        if (!btn) return;
        var original = btn.dataset.label || btn.textContent;
        btn.dataset.label = original;
        btn.classList.add("is-saved");
        btn.textContent = doneLabel || "Saved";
        setTimeout(function () {
            btn.classList.remove("is-saved");
            btn.textContent = btn.dataset.label || original;
        }, 1600);
    }

    function setBusy(btn, busy) {
        if (!btn) return;
        btn.disabled = !!busy;
        btn.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function showFieldError(inputId, errorId, message) {
        var input = $(inputId);
        var err = $(errorId);
        if (input) {
            if (message) input.setAttribute("aria-invalid", "true");
            else input.removeAttribute("aria-invalid");
        }
        if (err) {
            err.hidden = !message;
            err.textContent = message || "";
        }
        return !message;
    }

    function errText(error, fallback) {
        if (!error) return fallback;
        return error.detail || error.message || fallback;
    }

    /* =======================================================
       CLIENT-SIDE VALIDATION (mirrors server rules)
       ======================================================= */
    function validateAccountFields() {
        var ok = true;
        var name = ($("acctName") || {}).value || "";
        ok = showFieldError("acctName", "acctNameError",
            name.trim().length >= 2 ? null : "Display name must be at least 2 characters.") && ok;

        var username = ($("acctUsername") || {}).value || "";
        username = username.trim().replace(/^@+/, "");
        var usernameMsg = null;
        if (username && !USERNAME_RE.test(username)) {
            usernameMsg = "Use 3-24 letters, numbers or underscores.";
        }
        ok = showFieldError("acctUsername", "acctUsernameError", usernameMsg) && ok;

        var phone = ($("acctPhone") || {}).value || "";
        var phoneMsg = null;
        if (phone.trim()) {
            var digits = phone.replace(/\D/g, "");
            if (digits.length < 7 || digits.length > 15) {
                phoneMsg = "Enter a valid phone number (7-15 digits).";
            }
        }
        ok = showFieldError("acctPhone", "acctPhoneError", phoneMsg) && ok;
        return ok;
    }

    function passwordScore(value) {
        var v = String(value || "");
        if (v.length < 8) return 0;
        var score = 1;
        if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
        if (/\d/.test(v)) score++;
        if (/[^\w\s]/.test(v)) score++;
        return score;
    }

    function updatePasswordMeter() {
        var v = ($("newPassword") || {}).value || "";
        var bar = $("pwMeterBar");
        var txt = $("pwStrengthText");
        if (!bar || !txt) return;
        bar.className = "pw-meter-bar";
        if (!v) {
            txt.textContent = "Use 8+ characters mixing letters, numbers and symbols.";
            return;
        }
        if (v.length < 8) {
            bar.classList.add("is-weak");
            txt.textContent = "Too short - use at least 8 characters.";
            return;
        }
        var score = passwordScore(v);
        if (score >= 4) {
            bar.classList.add("is-strong");
            txt.textContent = "Strong password.";
        } else {
            bar.classList.add("is-fair");
            txt.textContent = "Fair - add uppercase, numbers or symbols for a stronger password.";
        }
    }

    /* =======================================================
       SWITCH / RADIO CONTROLS
       ======================================================= */
    function switchOn(id) {
        var el = $(id);
        return !!(el && el.getAttribute("aria-checked") === "true");
    }
    function setSwitch(id, on) {
        var el = $(id);
        if (el) el.setAttribute("aria-checked", on ? "true" : "false");
    }
    function setRadio(name, value) {
        all('input[name="' + name + '"]').forEach(function (r) {
            r.checked = (r.value === value);
        });
    }
    function radioValue(name) {
        var checked = document.querySelector('input[name="' + name + '"]:checked');
        return checked ? checked.value : null;
    }

    /* =======================================================
       COLLECTORS (current UI state per section)
       ======================================================= */
    function collectAccount() {
        return {
            name: (($("acctName") || {}).value || "").trim(),
            username: (($("acctUsername") || {}).value || "").trim().replace(/^@+/, ""),
            phone: (($("acctPhone") || {}).value || "").trim(),
            avatar: state.avatarCleared ? "" : (state.pendingAvatar || null)
        };
    }
    function collectPrivacy() {
        return {
            profile_visibility: radioValue("profileVisibility") || "public",
            discoverable: switchOn("privDiscoverable"),
            allow_messages: switchOn("privAllowMessages")
        };
    }
    function collectNotifications() {
        return {
            in_app: switchOn("notifyInApp"),
            application_status: switchOn("notifyApplicationStatus"),
            innovation: switchOn("notifyInnovation"),
            innovation_invite: switchOn("notifyInnovationInvite"),
            innovation_feedback: switchOn("notifyInnovationFeedback"),
            general: switchOn("notifyGeneral")
        };
    }
    function collectCareer() {
        var looking = [];
        all("#lookingForChips input[type=checkbox]:checked").forEach(function (c) {
            if (c.value) looking.push(c.value);
        });
        return {
            target_job_role: (($("carTargetRole") || {}).value || "").trim(),
            preferred_industry: (($("carIndustry") || {}).value || "").trim(),
            looking_for: looking
        };
    }

    function same(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /* =======================================================
       DIRTY TRACKING + SAVE BAR VISIBILITY
       ======================================================= */
    function refreshDirty(section) {
        if (!baseline[section]) return;
        var current;
        if (section === "account") current = collectAccount();
        else if (section === "privacy") current = collectPrivacy();
        else if (section === "notifications") current = collectNotifications();
        else if (section === "career") current = collectCareer();
        else return;

        SAVE_DIRTY[section] = !same(current, baseline[section]);
        var bar = document.querySelector('[data-save-for="' + section + '"]');
        var btn = $("save" + section.charAt(0).toUpperCase() + section.slice(1));
        if (bar) bar.hidden = !SAVE_DIRTY[section];
        if (btn) btn.disabled = !SAVE_DIRTY[section] || !!state.saving[section];
        if (SAVE_DIRTY[section]) setStatus(section, "Unsaved changes", null);
        else if (!state.saving[section]) setStatus(section, "", null);
    }
    function anyDirty() {
        return Object.keys(SAVE_DIRTY).some(function (k) { return SAVE_DIRTY[k]; });
    }

    /* =======================================================
       RENDERERS
       ======================================================= */
    function renderIdentity() {
        var u = state.user || {};
        var name = u.name || "Member";
        $("identityName").textContent = name;
        $("identityEmail").textContent = u.email || "";

        var avatar = $("identityAvatar");
        var fallback = $("identityFallback");
        if (u.avatar_url) {
            avatar.src = u.avatar_url;
            avatar.hidden = false;
            fallback.hidden = true;
        } else {
            avatar.hidden = true;
            fallback.hidden = false;
            fallback.textContent = initialsOf(name);
        }

        var role = normalizeRole(u.role);
        var rolePill = $("identityRole");
        rolePill.textContent = role;

        var status = String(u.account_status || "active").toLowerCase();
        var statusPill = $("identityStatus");
        statusPill.textContent = status === "active" ? "Active" : status;
        statusPill.className = "pill pill-status " +
            (status === "active" ? "is-active" : "is-deactivated");

        var pub = $("identityPublicId");
        if (u.public_id) {
            pub.hidden = false;
            pub.textContent = u.public_id;
        } else { pub.hidden = true; }

        var react = $("reactivateBtn");
        if (react) react.hidden = (status === "active");

        var secLine = $("secStatusLine");
        if (secLine) {
            secLine.textContent = status === "active" ? "Account active" :
                ("Account " + status);
        }
    }

    function renderAccountForm() {
        var u = state.user || {};
        $("acctName").value = u.name || "";
        $("acctUsername").value = u.username || "";
        $("acctEmail").value = u.email || "";
        $("acctPhone").value = u.phone || "";
        $("acctPublicId").textContent = u.public_id || "-";
        $("acctRole").textContent = normalizeRole(u.role);
        var status = String(u.account_status || "active").toLowerCase();
        $("acctStatus").textContent = status;
        $("acctCreated").textContent = fmtDate(u.created_at);

        var img = $("acctAvatar");
        var fb = $("acctAvatarFallback");
        if (u.avatar_url) {
            img.src = u.avatar_url;
            img.hidden = false;
            fb.hidden = true;
            $("acctAvatarClear").hidden = false;
        } else {
            img.hidden = true;
            fb.hidden = false;
            fb.textContent = initialsOf(u.name);
            $("acctAvatarClear").hidden = true;
        }
        state.pendingAvatar = null;
        state.avatarCleared = false;
        baseline.account = collectAccount();
        refreshDirty("account");
    }

    function renderPrivacy() {
        var s = (state.settings && state.settings) || {};
        setRadio("profileVisibility", s.profile_visibility === "private" ? "private" : "public");
        setSwitch("privDiscoverable", s.discoverable !== false);
        setSwitch("privAllowMessages", s.allow_messages !== false);
        baseline.privacy = collectPrivacy();
        refreshDirty("privacy");
    }

    function applyNotificationRowState() {
        var master = switchOn("notifyInApp");
        ["notifyApplicationStatus", "notifyInnovation", "notifyInnovationInvite",
            "notifyInnovationFeedback", "notifyGeneral"].forEach(function (id) {
            var el = $(id);
            if (el) el.disabled = !master;
        });
        var rows = $("notifyCategoryRows");
        if (rows) rows.style.opacity = master ? "" : ".55";
    }

    function renderNotifications() {
        var prefs = (state.settings && state.settings.notifications) || {};
        var get = function (k) { return prefs[k] !== false; }; /* default ON */
        setSwitch("notifyInApp", get("in_app"));
        setSwitch("notifyApplicationStatus", get("application_status"));
        setSwitch("notifyInnovation", get("innovation"));
        setSwitch("notifyInnovationInvite", get("innovation_invite"));
        setSwitch("notifyInnovationFeedback", get("innovation_feedback"));
        setSwitch("notifyGeneral", get("general"));
        applyNotificationRowState();
        baseline.notifications = collectNotifications();
        refreshDirty("notifications");
    }

    function ensureLookingForChips(values) {
        var box = $("lookingForChips");
        if (!box) return;
        var known = {};
        all("input[type=checkbox]", box).forEach(function (c) {
            known[String(c.value).toLowerCase()] = true;
        });
        (values || []).forEach(function (v) {
            var key = String(v || "").trim().toLowerCase();
            if (!key || known[key]) return;
            known[key] = true;
            var label = document.createElement("label");
            label.className = "chip";
            var input = document.createElement("input");
            input.type = "checkbox";
            input.value = String(v).trim();
            var span = document.createElement("span");
            span.textContent = String(v).trim();
            label.appendChild(input);
            label.appendChild(span);
            box.appendChild(label);
        });
    }

    function setLookingFor(values) {
        ensureLookingForChips(values);
        var wanted = {};
        (values || []).forEach(function (v) { wanted[String(v).toLowerCase()] = true; });
        all("#lookingForChips input[type=checkbox]").forEach(function (c) {
            c.checked = !!wanted[String(c.value).toLowerCase()];
        });
    }

    function renderCareer() {
        var role = state.role;
        var form = $("careerForm");
        var readonly = $("careerReadonly");
        var navLabel = $("navCareerLabel");
        var intro = $("careerIntro");

        if (role === "student") {
            navLabel.textContent = "Career preferences";
            intro.textContent = "These values feed real personalization: opportunity " +
                "recommendations, the AI Career Coach and CareerVerse all read your " +
                "target role and preferred industry.";
            form.hidden = false;
            readonly.hidden = true;
            if (state.roleProfileError) {
                $("carTargetRole").value = "";
                $("carIndustry").value = "";
                setLookingFor([]);
                baseline.career = collectCareer();
                var saveCareer = $("saveCareer");
                if (saveCareer) saveCareer.disabled = true;
                setStatus("career", "Preferences unavailable: " +
                    errText(state.roleProfileError, "profile could not be loaded"), "error");
                return;
            }
            var p = state.roleProfile || {};
            $("carTargetRole").value = p.target_job_role || "";
            $("carIndustry").value = p.preferred_industry || "";
            setLookingFor(Array.isArray(p.looking_for) ? p.looking_for : []);
            baseline.career = collectCareer();
            refreshDirty("career");
            return;
        }

        /* recruiters / mentors / other roles: read-only summary + link */
        form.hidden = true;
        readonly.hidden = false;
        var grid = $("careerSummary");
        if (role === "recruiter") {
            navLabel.textContent = "Hiring preferences";
            intro.textContent = "Company and hiring preferences are presented on your profile " +
                "pages. This section shows a read-only summary.";
            $("careerReadonlyTitle").textContent = "Your hiring preferences";
            grid.hidden = false;
            var rp = state.roleProfile || {};
            var join = function (v) {
                if (Array.isArray(v)) return v.join(", ") || "-";
                return v || "-";
            };
            var cell = function (key, value) {
                var dd = grid.querySelector('[data-summary="' + key + '"]');
                if (dd) dd.textContent = value;
            };
            cell("company", rp.company_name || "-");
            cell("hiring", join(rp.hiring_for));
            cell("roles", join(rp.job_roles));
            cell("skills", join(rp.required_skills));
        } else {
            navLabel.textContent = "Career profile";
            intro.textContent = "Your career presentation is managed on the Profile page, so " +
                "everything stays in one place.";
            $("careerReadonlyTitle").textContent = "Managed on your profile";
            grid.hidden = true;
        }
        baseline.career = collectCareer();
        refreshDirty("career");
    }

    /* =======================================================
       SECTION NAVIGATION (URL hash + mobile list/detail flow)
       ======================================================= */
    function normalizeSection(id) {
        if (!id) return null;
        id = String(id).replace(/^#/, "");
        if (LEGACY_HASH[id]) id = LEGACY_HASH[id];
        return SECTION_IDS.indexOf(id) !== -1 ? id : null;
    }

    function activateSection(id, opts) {
        id = normalizeSection(id) || "account";
        opts = opts || {};

        all(".settings-panel").forEach(function (panel) {
            var match = panel.getAttribute("data-panel") === id;
            panel.hidden = !match;
            if (match && opts.focusHeading) {
                var h = panel.querySelector(".panel-head h2");
                if (h) {
                    try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
                }
            }
        });
        all("#settingsNav .nav-item[data-section]").forEach(function (btn) {
            var match = btn.getAttribute("data-section") === id;
            btn.classList.toggle("active", match);
            if (match) btn.setAttribute("aria-current", "page");
            else btn.removeAttribute("aria-current");
        });

        var shell = $("settingsShell");
        if (shell && opts.mobileView) shell.classList.add("mobile-active");
        var back = $("settingsBack");
        if (back) back.hidden = !(shell && shell.classList.contains("mobile-active"));

        if (opts.pushHash !== false) {
            var target = "#" + id;
            if (window.location.hash !== target) {
                try { window.history.replaceState(null, "", target); }
                catch (e) { window.location.hash = id; }
            }
        }
    }

    /* =======================================================
       SAVE OPERATIONS (controlled, locked, real APIs)
       ======================================================= */
    function saveAccount() {
        if (state.saving.account) return;
        if (!validateAccountFields()) {
            setStatus("account", "Fix the highlighted fields first.", "error");
            return;
        }
        var current = collectAccount();
        var base = baseline.account || {};
        var payload = {};
        if (current.name !== base.name) payload.name = current.name;
        if (current.username !== base.username) payload.username = current.username;
        if (current.phone !== base.phone) payload.phone = current.phone;
        if (current.avatar !== base.avatar) payload.avatar_url = current.avatar || null;

        if (!Object.keys(payload).length) {
            refreshDirty("account");
            return;
        }

        var btn = $("saveAccount");
        state.saving.account = true;
        setBusy(btn, true);
        setStatus("account", "Saving...", null);

        window.SkillShareAPI.updateMyProfile(payload).then(function (res) {
            if (res && res.user) state.user = Object.assign({}, state.user, res.user);
            renderIdentity();
            renderAccountForm();   /* also re-baselines */
            setStatus("account", "Account updated.", "success");
            setBtnSaved(btn);
            toast("Account settings saved.", "success");
        }).catch(function (error) {
            setStatus("account", errText(error, "Could not save account settings."), "error");
        }).then(function () {
            state.saving.account = false;
            setBusy(btn, false);
            refreshDirty("account");
        });
    }

    function savePrivacy() {
        if (state.saving.privacy) return;
        var current = collectPrivacy();
        var base = baseline.privacy || {};
        var payload = {};
        if (current.profile_visibility !== base.profile_visibility)
            payload.profile_visibility = current.profile_visibility;
        if (current.discoverable !== base.discoverable)
            payload.discoverable = current.discoverable;
        if (current.allow_messages !== base.allow_messages)
            payload.allow_messages = current.allow_messages;
        if (!Object.keys(payload).length) { refreshDirty("privacy"); return; }

        var btn = $("savePrivacy");
        state.saving.privacy = true;
        setBusy(btn, true);
        setStatus("privacy", "Saving...", null);

        window.SkillShareAPI.updateSettings(payload).then(function (res) {
            if (res && res.settings) state.settings = res.settings;
            renderPrivacy();
            setStatus("privacy", "Privacy updated.", "success");
            setBtnSaved(btn);
            toast("Privacy settings saved.", "success");
        }).catch(function (error) {
            setStatus("privacy", errText(error, "Could not save privacy settings."), "error");
        }).then(function () {
            state.saving.privacy = false;
            setBusy(btn, false);
            refreshDirty("privacy");
        });
    }

    function saveNotifications() {
        if (state.saving.notifications) return;
        var current = collectNotifications();
        var btn = $("saveNotifications");
        state.saving.notifications = true;
        setBusy(btn, true);
        setStatus("notifications", "Saving...", null);

        window.SkillShareAPI.updateSettings({ notifications: current }).then(function (res) {
            if (res && res.settings) state.settings = res.settings;
            renderNotifications();
            setStatus("notifications", "Preferences updated.", "success");
            setBtnSaved(btn);
            toast("Notification preferences saved.", "success");
        }).catch(function (error) {
            setStatus("notifications",
                errText(error, "Could not save notification preferences."), "error");
        }).then(function () {
            state.saving.notifications = false;
            setBusy(btn, false);
            refreshDirty("notifications");
        });
    }

    function saveCareer() {
        if (state.saving.career || state.role !== "student" || state.roleProfileError) return;
        var current = collectCareer();
        var btn = $("saveCareer");
        state.saving.career = true;
        setBusy(btn, true);
        setStatus("career", "Saving...", null);

        window.SkillShareAPI.updateMyRoleProfile({
            profile: {
                target_job_role: current.target_job_role || "",
                preferred_industry: current.preferred_industry || "",
                looking_for: current.looking_for
            }
        }).then(function (res) {
            if (res && res.profile) state.roleProfile = res.profile;
            renderCareer();
            setStatus("career", "Career preferences updated.", "success");
            setBtnSaved(btn);
            toast("Career preferences saved - recommendations will use them.", "success");
        }).catch(function (error) {
            setStatus("career", errText(error, "Could not save career preferences."), "error");
        }).then(function () {
            state.saving.career = false;
            setBusy(btn, false);
            refreshDirty("career");
        });
    }

    /* =======================================================
       PASSWORD CHANGE
       ======================================================= */
    function submitPasswordForm(event) {
        if (event) event.preventDefault();
        if (state.saving.password) return;

        var current = ($("curPassword") || {}).value || "";
        var next = ($("newPassword") || {}).value || "";
        var confirm = ($("confirmPassword") || {}).value || "";
        var errEl = $("pwFormError");
        var msg = null;
        if (!current) msg = "Enter your current password.";
        else if (next.length < 8) msg = "New password must be at least 8 characters.";
        else if (next !== confirm) msg = "New passwords do not match.";
        else if (next === current) msg = "New password must be different from the current one.";

        if (errEl) { errEl.hidden = !msg; errEl.textContent = msg || ""; }
        if (msg) { setStatus("pw", "", null); return; }

        var btn = $("savePassword");
        state.saving.password = true;
        setBusy(btn, true);

        window.SkillShareAPI.changeMyPassword({
            current_password: current,
            new_password: next
        }).then(function () {
            ($("curPassword")).value = "";
            ($("newPassword")).value = "";
            ($("confirmPassword")).value = "";
            updatePasswordMeter();
            if (errEl) errEl.hidden = true;
            setBtnSaved(btn, "Updated");
            toast("Password updated successfully.", "success");
        }).catch(function (error) {
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = errText(error, "Could not update password.");
            }
        }).then(function () {
            state.saving.password = false;
            setBusy(btn, false);
        });
    }

    /* =======================================================
       AVATAR (staged locally, saved with the account form)
       ======================================================= */
    function handleAvatarFile(event) {
        var input = event && event.target;
        var file = input && input.files && input.files[0];
        var errEl = $("acctAvatarError");
        if (!file) return;
        if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

        if (["image/png", "image/jpeg", "image/webp"].indexOf(file.type) === -1) {
            if (errEl) { errEl.hidden = false; errEl.textContent = "Use a JPG, PNG or WebP image."; }
            input.value = "";
            return;
        }
        if (file.size > 500 * 1024) {
            if (errEl) { errEl.hidden = false; errEl.textContent = "Image must be 500 KB or smaller."; }
            input.value = "";
            return;
        }

        var reader = new FileReader();
        reader.onload = function () {
            state.pendingAvatar = String(reader.result || "");
            state.avatarCleared = false;
            var img = $("acctAvatar");
            var fb = $("acctAvatarFallback");
            if (img && state.pendingAvatar) {
                img.src = state.pendingAvatar;
                img.hidden = false;
                if (fb) fb.hidden = true;
                $("acctAvatarClear").hidden = false;
            }
            refreshDirty("account");
        };
        reader.onerror = function () {
            if (errEl) { errEl.hidden = false; errEl.textContent = "Could not read that file."; }
        };
        reader.readAsDataURL(file);
    }

    function clearAvatar() {
        state.avatarCleared = true;
        state.pendingAvatar = null;
        var img = $("acctAvatar");
        var fb = $("acctAvatarFallback");
        if (img) img.hidden = true;
        if (fb) { fb.hidden = false; fb.textContent = initialsOf((state.user || {}).name); }
        $("acctAvatarClear").hidden = true;
        refreshDirty("account");
    }

    /* =======================================================
       DEVICE PREFERENCES (appearance + accessibility)
       ======================================================= */
    function uiPrefs() {
        return window.SkillShareUIPrefs || null;
    }

    function loadPrefsIntoUI() {
        var prefsApi = uiPrefs();
        var prefs = prefsApi ? prefsApi.load() : {};
        var choice = prefsApi ? prefsApi.themeChoice() : "dark";
        /* One legacy key: a light theme chosen on the old dashboard still wins. */
        if (!prefs.themeChoice) {
            try {
                if (localStorage.getItem("skillshare_theme") === "light") choice = "light";
            } catch (e) { /* storage unavailable */ }
        }
        setRadio("themeChoice", ["light", "dark", "system"].indexOf(choice) !== -1 ? choice : "dark");
        setRadio("densityChoice", prefs.density === "compact" ? "compact" : "comfortable");
        setSwitch("a11yReducedMotion", !!prefs.reducedMotion);
        setSwitch("a11yLargeText", !!prefs.largeText);
    }

    function pushPrefs() {
        var prefsApi = uiPrefs();
        var payload = {
            themeChoice: radioValue("themeChoice") || "dark",
            density: radioValue("densityChoice") || "comfortable",
            reducedMotion: switchOn("a11yReducedMotion"),
            largeText: switchOn("a11yLargeText")
        };
        if (prefsApi) {
            try { prefsApi.set(payload); return; } catch (e) { /* fall through */ }
        }
        /* Minimal fallback when neither shell script loaded. */
        try {
            localStorage.setItem("skillshare_ui_prefs", JSON.stringify(payload));
            localStorage.setItem("skillshare_theme",
                payload.themeChoice === "system" ? "dark" : payload.themeChoice);
        } catch (e) { /* storage unavailable */ }
    }

    /* =======================================================
       DATA EXPORT
       ======================================================= */
    function exportData() {
        var btn = $("exportData");
        if (state.saving.exporting) return;
        state.saving.exporting = true;
        setBusy(btn, true);
        var label = btn.innerHTML;
        btn.textContent = "Preparing...";

        window.SkillShareAPI.exportMyAccount().then(function (res) {
            var payload = (res && res.export) || res;
            var blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json"
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            var pid = ((state.user || {}).public_id || "data").toString().toLowerCase();
            a.href = url;
            a.download = "skillshare-export-" + pid + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
            toast("Your data export has downloaded.", "success");
        }).catch(function (error) {
            toast(errText(error, "Export failed. Please try again."), "error");
        }).then(function () {
            state.saving.exporting = false;
            setBusy(btn, false);
            btn.innerHTML = label;
        });
    }

    /* =======================================================
       MODALS + DESTRUCTIVE ACTIONS
       ======================================================= */
    var lastFocused = null;

    function openModal(id) {
        var modal = $(id);
        if (!modal) return;
        lastFocused = document.activeElement;
        modal.hidden = false;
        var focusTarget = modal.querySelector("input, button:not(.modal-close)");
        if (focusTarget) {
            try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
        }
    }
    function closeModal(modal) {
        if (!modal) return;
        /* Fully clear modal UI state on any close path (Cancel, X,
           backdrop, Escape) so nothing re-appears or stays gated. */
        if (modal.id === "deleteModal") {
            var dText = $("deleteConfirmText");
            var dPw = $("deletePassword");
            var dErr = $("deleteError");
            if (dText) dText.value = "";
            if (dPw) dPw.value = "";
            if (dErr) dErr.hidden = true;
            gateDelete();
        } else if (modal.id === "deactivateModal") {
            var aPw = $("deactivatePassword");
            var aErr = $("deactivateError");
            if (aPw) aPw.value = "";
            if (aErr) aErr.hidden = true;
            gateDeactivate();
        }
        modal.hidden = true;
        if (lastFocused && lastFocused.focus) {
            try { lastFocused.focus({ preventScroll: true }); } catch (e) { lastFocused.focus(); }
        }
    }
    function activeModal() {
        return document.querySelector(".modal-backdrop:not([hidden])");
    }

    function gateDeactivate() {
        var pw = ($("deactivatePassword") || {}).value || "";
        var btn = $("confirmDeactivate");
        if (btn) btn.disabled = !pw || !!state.saving.deactivating;
    }
    function gateDelete() {
        var phrase = ($("deleteConfirmText") || {}).value || "";
        var pw = ($("deletePassword") || {}).value || "";
        var btn = $("confirmDelete");
        if (btn) {
            btn.disabled = !(phrase.trim().toUpperCase() === "DELETE" && pw) ||
                !!state.saving.deleting;
        }
    }

    function sessionExit() {
        try { window.SkillShareAPI.clearSession(); } catch (e) { /* ignore */ }
        try { localStorage.removeItem("skillshare_portal_role"); } catch (e) { /* ignore */ }
        /* Return here after sign-in so a deactivated user lands on the
           Reactivate control immediately. */
        window.location.href = "login.html?next=" + encodeURIComponent("setting.html");
    }

    function confirmDeactivate() {
        if (state.saving.deactivating) return;
        var pw = ($("deactivatePassword") || {}).value || "";
        if (!pw) return;
        var btn = $("confirmDeactivate");
        var errEl = $("deactivateError");
        if (errEl) errEl.hidden = true;
        state.saving.deactivating = true;
        setBusy(btn, true);

        window.SkillShareAPI.deactivateMyAccount({ password: pw }).then(function () {
            closeModal($("deactivateModal"));
            toast("Account deactivated. You can reactivate any time by signing in.", "success");
            setTimeout(sessionExit, 900);
        }).catch(function (error) {
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = errText(error, "Could not deactivate the account.");
            }
        }).then(function () {
            state.saving.deactivating = false;
            setBusy(btn, false);
            gateDeactivate();
        });
    }

    function confirmDelete() {
        if (state.saving.deleting) return;
        var phrase = (($("deleteConfirmText") || {}).value || "").trim();
        var pw = ($("deletePassword") || {}).value || "";
        if (phrase.toUpperCase() !== "DELETE" || !pw) return;
        var btn = $("confirmDelete");
        var errEl = $("deleteError");
        if (errEl) errEl.hidden = true;
        state.saving.deleting = true;
        setBusy(btn, true);

        window.SkillShareAPI.deleteMyAccount({ password: pw, confirm: phrase }).then(function () {
            closeModal($("deleteModal"));
            toast("Account deleted.", "success");
            setTimeout(sessionExit, 700);
        }).catch(function (error) {
            if (errEl) {
                errEl.hidden = false;
                errEl.textContent = errText(error, "Could not delete the account.");
            }
        }).then(function () {
            state.saving.deleting = false;
            setBusy(btn, false);
            gateDelete();
        });
    }

    function reactivateAccount() {
        var btn = $("reactivateBtn");
        if (state.saving.reactivating) return;
        state.saving.reactivating = true;
        setBusy(btn, true);
        window.SkillShareAPI.reactivateMyAccount().then(function (res) {
            if (state.user) state.user.account_status = (res && res.account_status) || "active";
            renderIdentity();
            renderAccountForm();
            toast("Welcome back - your account is active again.", "success");
        }).catch(function (error) {
            toast(errText(error, "Could not reactivate the account."), "error");
        }).then(function () {
            state.saving.reactivating = false;
            setBusy(btn, false);
        });
    }

    /* =======================================================
       EVENT BINDING (once)
       ======================================================= */
    function isMobile() {
        return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    }

    /* Modal open/cancel bindings run independently of auth/boot:
       Cancel/Escape must work even before requireUser() resolves
       (they previously stayed dead until bindEvents ran late). */
    function bindModalEvents() {
        if (state.modalsBound) return;
        state.modalsBound = true;

        on($("openDeactivate"), "click", function () {
            ($("deactivatePassword")).value = "";
            var errEl = $("deactivateError");
            if (errEl) errEl.hidden = true;
            gateDeactivate();
            openModal("deactivateModal");
        });
        on($("openDelete"), "click", function () {
            ($("deleteConfirmText")).value = "";
            ($("deletePassword")).value = "";
            var errEl = $("deleteError");
            if (errEl) errEl.hidden = true;
            gateDelete();
            openModal("deleteModal");
        });
        all("[data-close-modal]").forEach(function (btn) {
            on(btn, "click", function () {
                closeModal(btn.closest(".modal-backdrop"));
            });
        });
        all(".modal-backdrop").forEach(function (backdrop) {
            on(backdrop, "click", function (event) {
                if (event.target === backdrop) closeModal(backdrop);
            });
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                var modal = activeModal();
                if (modal) closeModal(modal);
            }
        });
        on($("deactivatePassword"), "input", gateDeactivate);
        on($("deleteConfirmText"), "input", gateDelete);
        on($("deletePassword"), "input", gateDelete);
        on($("confirmDeactivate"), "click", confirmDeactivate);
        on($("confirmDelete"), "click", confirmDelete);
    }

    function bindEvents() {
        if (state.bound) return;
        state.bound = true;

        /* --- navigation --- */
        all("#settingsNav .nav-item[data-section]").forEach(function (btn) {
            on(btn, "click", function () {
                activateSection(btn.getAttribute("data-section"), {
                    mobileView: isMobile(),
                    focusHeading: isMobile()
                });
            });
        });
        on($("settingsBack"), "click", function () {
            var shell = $("settingsShell");
            if (shell) shell.classList.remove("mobile-active");
            $("settingsBack").hidden = true;
            var first = document.querySelector("#settingsNav .nav-item.active") ||
                document.querySelector("#settingsNav .nav-item");
            if (first) first.focus();
        });
        window.addEventListener("hashchange", function () {
            activateSection(window.location.hash, { pushHash: false, mobileView: isMobile() });
        });

        /* --- logout (two entry points) --- */
        function doLogout() {
            if (anyDirty() && !window.confirm("You have unsaved changes. Log out anyway?")) return;
            if (window.SkillShareAuth && window.SkillShareAuth.logout) {
                window.SkillShareAuth.logout();
            } else {
                sessionExit();
            }
        }
        on($("settingsLogout"), "click", doLogout);
        on($("securityLogout"), "click", doLogout);

        /* --- generic switch behavior --- */
        all(".switch").forEach(function (sw) {
            on(sw, "click", function () {
                if (sw.disabled) return;
                var next = sw.getAttribute("aria-checked") !== "true";
                sw.setAttribute("aria-checked", next ? "true" : "false");

                switch (sw.id) {
                    case "privDiscoverable":
                    case "privAllowMessages":
                        refreshDirty("privacy");
                        break;
                    case "notifyInApp":
                        applyNotificationRowState();
                        refreshDirty("notifications");
                        break;
                    case "notifyApplicationStatus":
                    case "notifyInnovation":
                    case "notifyInnovationInvite":
                    case "notifyInnovationFeedback":
                    case "notifyGeneral":
                        refreshDirty("notifications");
                        break;
                    case "a11yReducedMotion":
                    case "a11yLargeText":
                        pushPrefs();
                        toast("Saved on this device.", "success");
                        break;
                    default:
                        break;
                }
            });
            /* keyboard: role=switch buttons already respond to Enter/Space
               as native buttons; nothing extra required. */
        });

        /* --- radio-driven state --- */
        all('input[name="profileVisibility"]').forEach(function (r) {
            on(r, "change", function () { refreshDirty("privacy"); });
        });
        all('input[name="themeChoice"]').forEach(function (r) {
            on(r, "change", function () { pushPrefs(); });
        });
        all('input[name="densityChoice"]').forEach(function (r) {
            on(r, "change", function () { pushPrefs(); });
        });
        all("#lookingForChips input[type=checkbox]").forEach(function (c) {
            on(c, "change", function () { refreshDirty("career"); });
        });

        /* --- account inputs (dirty + inline validation) --- */
        ["acctName", "acctUsername", "acctPhone"].forEach(function (id) {
            on($(id), "input", function () {
                validateAccountFields();
                refreshDirty("account");
            });
        });
        on($("acctAvatarBtn"), "click", function () { ($("acctAvatarFile")).click(); });
        on($("acctAvatarFile"), "change", handleAvatarFile);
        on($("acctAvatarClear"), "click", clearAvatar);

        /* --- career inputs --- */
        ["carTargetRole", "carIndustry"].forEach(function (id) {
            on($(id), "input", function () { refreshDirty("career"); });
        });

        /* --- save buttons --- */
        on($("saveAccount"), "click", saveAccount);
        on($("resetAccount"), "click", function () {
            renderAccountForm();
            validateAccountFields();
            setStatus("account", "Changes discarded.", null);
        });
        on($("savePrivacy"), "click", savePrivacy);
        on($("resetPrivacy"), "click", function () {
            renderPrivacy();
            setStatus("privacy", "Changes discarded.", null);
        });
        on($("saveNotifications"), "click", saveNotifications);
        on($("resetNotifications"), "click", function () {
            renderNotifications();
            setStatus("notifications", "Changes discarded.", null);
        });
        on($("saveCareer"), "click", saveCareer);
        on($("resetCareer"), "click", function () {
            renderCareer();
            setStatus("career", "Changes discarded.", null);
        });

        /* --- password form --- */
        on($("passwordForm"), "submit", submitPasswordForm);
        on($("resetPassword"), "click", function () {
            ($("curPassword")).value = "";
            ($("newPassword")).value = "";
            ($("confirmPassword")).value = "";
            var errEl = $("pwFormError");
            if (errEl) errEl.hidden = true;
            updatePasswordMeter();
        });
        on($("newPassword"), "input", updatePasswordMeter);

        /* --- export / reactivate --- */
        on($("exportData"), "click", exportData);
        on($("reactivateBtn"), "click", reactivateAccount);

        /* --- modals (idempotent; also bound early at init) --- */
        bindModalEvents();

        /* --- unsaved-change protection (prompt only, never auto-save) --- */
        window.addEventListener("beforeunload", function (event) {
            if (!anyDirty()) return;
            event.preventDefault();
            event.returnValue = "";
            return "";
        });
    }

    /* =======================================================
       BOOTSTRAP (real data only; skeleton -> content | error)
       ======================================================= */
    function showBootError(message) {
        ($("settingsLoading")).hidden = true;
        ($("settingsShell")).hidden = true;
        var box = $("settingsError");
        box.hidden = false;
        var msg = $("settingsErrorMsg");
        if (msg) msg.textContent = message || "Something went wrong while loading settings.";
    }

    function boot(isRetry) {
        ($("settingsError")).hidden = true;
        ($("settingsLoading")).hidden = false;
        ($("settingsShell")).hidden = true;

        window.SkillShareAuth.requireUser().then(function (user) {
            if (!user) return; /* redirect to login already in progress */
            state.user = user;
            state.role = normalizeRole(user.role);
            bindEvents();

            return Promise.all([
                window.SkillShareAPI.getSettings().catch(function (error) {
                    return { __error: error };
                }),
                window.SkillShareAPI.getMyRoleProfile().catch(function (error) {
                    return { __error: error };
                })
            ]).then(function (results) {
                var settingsRes = results[0];
                var roleRes = results[1];

                if (settingsRes && settingsRes.__error) {
                    showBootError(window.SkillShareAuth.getErrorMessage
                        ? window.SkillShareAuth.getErrorMessage(settingsRes.__error)
                        : errText(settingsRes.__error, "Settings service unavailable."));
                    return;
                }
                state.settings = settingsRes.settings || {
                    profile_visibility: "public",
                    discoverable: true,
                    allow_messages: true,
                    notifications: {}
                };

                if (roleRes && roleRes.__error) {
                    state.roleProfile = null;
                    state.roleProfileError = roleRes.__error;
                } else {
                    state.roleProfile = (roleRes && roleRes.profile) || {};
                    state.roleProfileError = null;
                }

                renderIdentity();
                renderAccountForm();
                renderPrivacy();
                renderNotifications();
                renderCareer();
                loadPrefsIntoUI();
                updatePasswordMeter();

                ($("settingsLoading")).hidden = true;
                ($("settingsShell")).hidden = false;
                state.booted = true;

                /* Deep links (#privacy etc.) open directly; on mobile that
                   means starting in the section (detail) view. Plain
                   setting.html (empty/unknown hash) always lands on the
                   default Account section - Danger/Delete never auto-open. */
                activateSection(window.location.hash || "account", {
                    pushHash: false,
                    mobileView: !!window.location.hash && isMobile()
                });
                /* Guarantee no leftover modal state survives a boot. */
                all(".modal-backdrop").forEach(function (m) { m.hidden = true; });
            });
        }).catch(function (error) {
            if (error && error.status === 401) return; /* auth.js redirects */
            showBootError(window.SkillShareAuth && window.SkillShareAuth.getErrorMessage
                ? window.SkillShareAuth.getErrorMessage(error)
                : errText(error, "Could not load settings."));
        });
    }

    /* =======================================================
       INITIALIZATION
       ======================================================= */
    /* Retry must work even when the very first boot failed before
       bindEvents() ever ran (network failure on requireUser). */
    on($("settingsRetry"), "click", function () { boot(true); });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            bindModalEvents();
            boot(false);
        });
    } else {
        bindModalEvents();
        boot(false);
    }
})();