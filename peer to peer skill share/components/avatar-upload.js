/* =========================================================
   SKILLSHARE — SHARED AVATAR UPLOAD COMPONENT
   Used by the profile page (hero + corner pencils) and by the
   shared navbar profile circle (components/profile-dropdown.js).

   Flow: gallery/file picker -> validate (JPG/PNG/WebP <= 500KB)
   -> canvas resize (center-crop to 512x512 JPEG; falls back to
   the raw data URL when canvas is unavailable) -> PATCH
   /api/users/me { avatar_url } -> refresh the localStorage
   session -> dispatch "skillshare:avatar-updated".

   Storage follows the Settings page convention: avatar_url holds
   a data URL (users.avatar_url is an unbounded VARCHAR), so the
   photo travels with the account and no file server is needed.
   Uses the existing SkillShareAPI layer; no backend changes.
   ========================================================= */
window.SkillShareAvatarUpload = (function () {
    "use strict";

    var ACCEPT = ["image/png", "image/jpeg", "image/webp"];
    var MAX_BYTES = 500 * 1024;
    var MAX_SIDE = 512;

    function fail(message) {
        var error = new Error(message);
        error.status = 0;
        error.detail = message; /* errDetail() prefers .detail */
        return error;
    }

    function validate(file) {
        if (!file) return "No image selected.";
        if (ACCEPT.indexOf(file.type) === -1) {
            return "Use a JPG, PNG or WebP image.";
        }
        if (file.size > MAX_BYTES) {
            return "Image must be 500 KB or smaller.";
        }
        return null;
    }

    /* Read the file, then center-crop + scale so one avatar stays small
       enough for localStorage (session) and every navbar render.
       Without canvas support (offline tests) the raw data URL is used —
       same behaviour as the Settings page upload. */
    function toDataUrl(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onerror = function () { resolve(null); };
            reader.onload = function () {
                var raw = String(reader.result || "");
                var ctx = null;
                try {
                    var probe = document.createElement("canvas");
                    ctx = probe.getContext ? probe.getContext("2d") : null;
                } catch (e) { ctx = null; }
                if (!ctx) { resolve(raw); return; } /* no canvas -> keep raw */
                var img = new Image();
                img.onerror = function () { resolve(raw); };
                img.onload = function () {
                    try {
                        var side = Math.min(img.naturalWidth, img.naturalHeight);
                        if (!side) { resolve(raw); return; }
                        var sx = (img.naturalWidth - side) / 2;
                        var sy = (img.naturalHeight - side) / 2;
                        var canvas = document.createElement("canvas");
                        canvas.width = MAX_SIDE;
                        canvas.height = MAX_SIDE;
                        var context = canvas.getContext("2d");
                        if (!context) { resolve(raw); return; }
                        /* JPEG has no alpha channel — flatten on white. */
                        context.fillStyle = "#ffffff";
                        context.fillRect(0, 0, MAX_SIDE, MAX_SIDE);
                        context.drawImage(img, sx, sy, side, side,
                                          0, 0, MAX_SIDE, MAX_SIDE);
                        resolve(canvas.toDataURL("image/jpeg", 0.85));
                    } catch (e) {
                        resolve(raw);
                    }
                };
                img.src = raw;
            };
            reader.readAsDataURL(file);
        });
    }

    /* PATCH the avatar, refresh the stored session user so every circle
       (this page and the next page load) sees the new photo, then tell
       the rest of the UI via "skillshare:avatar-updated". */
    function persist(avatarUrl) {
        var API = window.SkillShareAPI;
        if (!API || typeof API.updateMyProfile !== "function") {
            return Promise.reject(fail("The API client failed to load."));
        }
        return API.updateMyProfile({ avatar_url: avatarUrl }).then(function (res) {
            var user = (res && res.user) || null;
            try {
                if (user && API.setSession) {
                    API.setSession(API.getToken(),
                        Object.assign({}, API.getUser() || {}, user));
                }
            } catch (e) { /* localStorage unavailable — render still updates */ }
            var detail = { avatar_url: avatarUrl, user: user };
            try {
                window.dispatchEvent(
                    new CustomEvent("skillshare:avatar-updated",
                                    { detail: detail }));
            } catch (e) { /* CustomEvent unsupported — skip notification */ }
            return detail;
        });
    }

    /* Opens the gallery/file picker. Resolves {avatar_url, user}. */
    function pick() {
        var API = window.SkillShareAPI;
        if (!API || !API.getToken || !API.getToken()) {
            return Promise.reject(fail("Sign in to change your photo."));
        }
        return new Promise(function (resolve, reject) {
            var input = document.createElement("input");
            input.type = "file";
            input.accept = ACCEPT.join(",");
            input.setAttribute("data-ss-avatar-input", "1");
            input.style.display = "none";

            function cleanup() {
                if (input.parentNode) input.parentNode.removeChild(input);
            }

            input.addEventListener("change", function () {
                var file = input.files && input.files[0];
                var problem = validate(file);
                if (problem) {
                    cleanup();
                    reject(fail(problem));
                    return;
                }
                toDataUrl(file).then(function (dataUrl) {
                    cleanup();
                    if (!dataUrl) {
                        reject(fail("Could not read that image."));
                        return;
                    }
                    persist(dataUrl).then(resolve, reject);
                });
            });

            document.body.appendChild(input);
            input.click();
        });
    }

    return { pick: pick, validate: validate, _toDataUrl: toDataUrl };
})();
