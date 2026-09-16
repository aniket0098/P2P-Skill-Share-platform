/* controls: mic/cam/screen/disconnect */
"use strict";
window.DiscussionMedia.syncButtons = function () {
    const mic = document.getElementById("micBtn");
    const cam = document.getElementById("camBtn");
    const scr = document.getElementById("screenBtn");
    const hand = document.getElementById("handBtn");
    if (mic) {
        mic.classList.toggle("off", !this.micOn);
        mic.innerHTML = '<i class="fa-solid fa-microphone' + (this.micOn ? "" : "-slash") + '"></i><span>Mic</span>';
    }
    if (cam) {
        cam.classList.toggle("off", !this.camOn);
        cam.innerHTML = '<i class="fa-solid fa-video' + (this.camOn ? "" : "-slash") + '"></i><span>Camera</span>';
    }
    if (scr) {
        scr.classList.toggle("live", !!this.sharing);
        scr.innerHTML = '<i class="fa-solid fa-display"></i><span>' + (this.sharing ? "Stop" : "Share") + "</span>";
    }
    if (hand) {
        hand.classList.toggle("live", !!this.handRaised);
        hand.innerHTML = '<i class="fa-regular fa-hand"></i><span>Hand</span>';
    }
};
window.DiscussionMedia.toggleMic = async function () {
    try {
        if (!this.room || !this.local) { showToast("Join the live room first (retry if needed).", true); return; }
        if (!this.micOn) { await this.local.setMicrophoneEnabled(true); this.micOn = true; console.log("[LiveKit] Mic unmuted"); }
        else { await this.local.setMicrophoneEnabled(false); this.micOn = false; console.log("[LiveKit] Mic muted"); }
        this.syncButtons(); this.paintAll();
    } catch (err) { showToast("Microphone unavailable: " + ((err && err.message) || "permission denied"), true); }
};
/* ---- local camera helpers ------------------------------------------
   LiveKit reuses the camera PUBLICATION object across camera off/on. When
   the camera was switched off the media track behind that publication may
   already be stopped, so `pub.track` is useless for re-attaching. These
   helpers find a genuinely live camera track, and if none appears they are
   paired with an explicit re-publish in toggleCam(). */
window.DiscussionMedia.localCameraTrack = function () {
    try {
        const pub = this.local.getTrackPublication(window.LivekitClient.Track.Source.Camera);
        if (!pub || !pub.track) return null;
        const mt = pub.track.mediaStreamTrack;
        if (mt && mt.readyState === "ended") return null;
        return pub.track;
    } catch (e) { return null; }
};
window.DiscussionMedia.waitLocalCameraTrack = async function (timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    for (;;) {
        const t = this.localCameraTrack();
        if (t) return t;
        if (Date.now() >= deadline) return null;
        await new Promise(function (r) { setTimeout(r, 250); });
    }
};
window.DiscussionMedia.toggleCam = async function () {
    try {
        if (!this.room || !this.local) { showToast("Join the live room first (retry if needed).", true); return; }
        const Lk = window.LivekitClient;
        if (!this.camOn) {
            console.log("[LiveKit] Camera enabling");
            let ok = true;
            try { await this.local.setCameraEnabled(true); }
            catch (e1) {
                ok = false;
                console.log("[LiveKit] setCameraEnabled(true) threw: " + ((e1 && (e1.name + ": " + e1.message)) || e1));
            }
            console.log("[LiveKit] re-enabled=" + ok + "; isCameraEnabled=" + this.local.isCameraEnabled);
            let track = ok ? await this.waitLocalCameraTrack(6000) : null;
            if (!track) {
                console.log("[LiveKit] no live camera track; re-publishing a fresh one");
                /* The publication survived but its media track was stopped.
                   Drop it and publish a REAL, freshly captured camera track. */
                try {
                    const stale = this.local.getTrackPublication(Lk.Track.Source.Camera);
                    if (stale && stale.track) await this.local.unpublishTrack(stale.track, true);
                } catch (e) {}
                if (typeof Lk.createLocalVideoTrack === "function") {
                    const fresh = await Lk.createLocalVideoTrack();
                    await this.local.publishTrack(fresh);
                    track = fresh;
                }
            }
            console.log("[LiveKit] camera track ready=" + !!track);
            this.camOn = true;
            /* Force a fresh preview element + play(): the reused element can
               otherwise stay frozen at 0x0 after the capture was stopped. */
            if (track) this.attachTrack(track, this.local, false, true);
            /* Frames need a tick before they decode — re-attach once more. */
            try {
                const self = this;
                setTimeout(function () {
                    try {
                        const late = self.localCameraTrack();
                        if (late) self.attachTrack(late, self.local, false, true);
                        self.paintAll();
                    } catch (e) {}
                }, 1200);
            } catch (e) {}
            console.log("[LiveKit] Camera on");
        } else {
            await this.local.setCameraEnabled(false); this.camOn = false;
            const tile = this.tiles.get(this.local.identity);
            if (tile) { const v = tile.querySelector("video"); if (v) v.remove(); }
            console.log("[LiveKit] Camera off");
        }
        this.syncButtons(); this.paintAll();
    } catch (err) {
        console.log("[LiveKit] Camera error: " + ((err && (err.name + ": " + err.message)) || err));
        showToast("Camera unavailable: " + ((err && err.message) || "permission denied") + ". Room stays usable.", true);
    }
};
window.DiscussionMedia.toggleScreen = async function () {
    try {
        if (!this.room || !this.local) { showToast("Join the live room first (retry if needed).", true); return; }
        if (!this.sharing) {
            await this.local.setScreenShareEnabled(true); this.sharing = true;
            try {
                const pub = this.local.getTrackPublication(window.LivekitClient.Track.Source.ScreenShare);
                if (pub && pub.track) this.attachTrack(pub.track, this.local, true);
            } catch (e) {}
            /* The screen track may need a tick before frames flow — repaint
               shortly after start so the tile picks up real dimensions. */
            try {
                const self = this;
                setTimeout(function () {
                    try {
                        const late = self.local.getTrackPublication(window.LivekitClient.Track.Source.ScreenShare);
                        if (late && late.track) self.attachTrack(late.track, self.local, true);
                    } catch (e) {}
                }, 1200);
            } catch (e) {}
            console.log("[LiveKit] Screen share started");
        } else {
            await this.local.setScreenShareEnabled(false); this.sharing = false;
            const tile = this.tiles.get(this.local.identity + "#screen");
            if (tile) {
                /* Release the presenter camera PiP with the share tile. */
                try { this.clearPresenterPiP(tile); } catch (e) {}
                tile.remove(); this.tiles.delete(this.local.identity + "#screen");
            }
            if (this.presentOrder) {
                const sid = this.local.identity + "#screen";
                this.presentOrder = this.presentOrder.filter(function (id) { return id !== sid; });
            }
            if (this.activeShareIdentity === this.local.identity + "#screen") {
                this.activeShareIdentity = null;
            }
            if (this.updateShareSelector) this.updateShareSelector();
            try { this.queueLayout(); } catch (e) {}
            console.log("[LiveKit] Screen share stopped");
        }
        this.syncButtons();
    } catch (err) {
        if (err && err.name === "NotAllowedError") showToast("Screen-share permission was dismissed.", true);
        else showToast("Screen share failed: " + ((err && err.message) || "unknown error"), true);
    }
};
window.DiscussionMedia.disconnect = async function () {
    try { if (this.room) await this.room.disconnect(); } catch (e) {}
    this.room = null; this.local = null;
    this.micOn = false; this.camOn = false; this.sharing = false;
    this.handRaised = false;
    this.pinnedIdentity = null;
    this.spotlightIdentity = null;
    this.activeShareIdentity = null;
    this.presentMode = false;
    this.presentOrder = [];
    try { this.exitPresentation(); } catch (e) {}
    try { if (this.updateShareSelector) this.updateShareSelector(); } catch (e) {}
    try { this.syncButtons(); } catch (e) {}
    /* Leave the tiles map empty so a later connect() starts from a clean
       slate (no stale remote tiles after an explicit disconnect). */
    try {
        const self = this;
        this.tiles.forEach(function (t) { try { t.remove(); } catch (e) {} });
        this.tiles.clear();
        const g = document.getElementById("livekitGrid");
        if (g) {
            const d = document.createElement("div");
            d.className = "lk-empty";
            d.textContent = "No live video yet. Turn your camera on or invite someone to join.";
            g.appendChild(d);
        }
    } catch (e) {}
    this.setStatus("DISCONNECTED", "Disconnected.");
};
window.DiscussionMedia.resetForReload = function () {
    /* Full page load / refresh: same cleanup as disconnect, but without
       flipping the visible state (connect() sets CONNECTING next). */
    this.room = null; this.local = null;
    this.micOn = false; this.camOn = false; this.sharing = false;
    this.presentMode = false; this.presentOrder = [];
    this._busy = false;
    try {
        this.tiles.forEach(function (t) { try { t.remove(); } catch (e) {} });
        this.tiles.clear();
    } catch (e) {}
};

/* ==========================================================
   MEETING UPGRADE (additive): raise hand, tile menu, pin /
   spotlight, presentation mode, active-share selector.
   None of these change the LiveKit connection — the room
   object, tracks and events above stay exactly as they are.
   ========================================================== */

/* ---- Raise hand (synced via LiveKit participant metadata) ---- */
window.DiscussionMedia.toggleHand = async function () {
    try {
        if (!this.room || !this.local) {
            showToast("Join the live room first (retry if needed).", true);
            return;
        }
        this.handRaised = !this.handRaised;
        try {
            await this.local.setMetadata(this.handRaised ? "hand_raised" : "");
        } catch (e) { console.log("[LiveKit] setMetadata unavailable:", e); }
        const tile = this.tiles.get(this.local.identity);
        if (tile) {
            let hand = tile.querySelector('[data-f="hand"]');
            if (!hand) {
                hand = document.createElement("span");
                hand.dataset.f = "hand";
                hand.title = "Hand raised";
                hand.innerHTML = '<i class="fa-regular fa-hand"></i>';
                const flags = tile.querySelector(".lk-flags");
                if (flags) flags.appendChild(hand);
            }
            hand.classList.toggle("raised", this.handRaised);
        }
        this.syncButtons();
        showToast(this.handRaised ? "Hand raised" : "Hand lowered");
    } catch (err) {
        showToast("Could not update your hand state.", true);
    }
};

/* ---- Pin / spotlight (layout-only; no server effect, no fakes) ---- */
window.DiscussionMedia.togglePin = function (identity) {
    const base = this.baseIdentityOf ? this.baseIdentityOf(identity) : identity;
    this.pinnedIdentity = this.pinnedIdentity === base ? null : base;
    this.applyLayoutRoles();
    try { this.queueLayout(); } catch (e) {}
    showToast(this.pinnedIdentity ? "Participant pinned." : "Pin removed.");
};

window.DiscussionMedia.setSpotlight = function (identity) {
    const base = this.baseIdentityOf ? this.baseIdentityOf(identity) : identity;
    this.spotlightIdentity = this.spotlightIdentity === base ? null : base;
    this.applyLayoutRoles();
    try { this.queueLayout(); } catch (e) {}
    showToast(this.spotlightIdentity ? "Participant spotlighted." : "Spotlight removed.");
};

window.DiscussionMedia.applyLayoutRoles = function () {
    const grid = document.getElementById("livekitGrid");
    if (!grid) return;
    grid.classList.toggle("has-spotlight", !!this.spotlightIdentity);
    grid.classList.toggle("has-pinned", !!this.pinnedIdentity);
    const self = this;
    this.tiles.forEach(function (t, id) {
        t.classList.toggle("pinned", id === self.pinnedIdentity);
        t.classList.toggle("spotlight", id === self.spotlightIdentity);
    });
};

/* ---- Participant three-dot menu ---- */
window.DiscussionMedia.closeTileMenu = function () {
    document.querySelectorAll(".lk-tile-menu").forEach(function (m) { m.remove(); });
};

window.DiscussionMedia.openTileMenu = function (tile, identity, isLocal) {
    this.closeTileMenu();
    const isScreen = identity.indexOf("#screen") !== -1;
    /* A screen tile ("identity#screen") reuses its presenter's menu: resolve
       to the base identity so pin/spotlight/profile/host actions target the
       right participant — no second moderation system. */
    const base = (this.baseIdentityOf ? this.baseIdentityOf(identity) : identity);
    const selfIsLocal = isLocal || (isScreen && this.local && base === this.local.identity);
    const self = this;
    const menu = document.createElement("div");
    menu.className = "lk-tile-menu";

    function add(label, icon, fn, cls) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lk-menu-item " + (cls || "");
        b.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + label;
        b.addEventListener("click", function (e) {
            e.stopPropagation();
            self.closeTileMenu();
            try { fn(); } catch (err) { console.log("[LiveKit] menu action failed:", err); }
        });
        menu.appendChild(b);
    }

    if (isScreen) {
        add(self.pinnedIdentity === base ? "Unpin presentation" : "Pin presentation", "fa-thumbtack", function () {
            self.togglePin(base);
        });
        add("Fullscreen presentation", "fa-expand", function () {
            try {
                if (tile.requestFullscreen) tile.requestFullscreen();
                else {
                    /* The presenter camera PiP video is never the screen
                       video — request fullscreen on the direct child. */
                    const v = self.screenVideoOf(tile);
                    if (v && v.requestFullscreen) v.requestFullscreen();
                }
            } catch (e) {}
        });
        add("View profile", "fa-circle-user", function () {
            if (typeof openProfilePopup === "function") {
                const uid = parseInt(String(base).replace("user_", ""), 10) || 0;
                if (uid) openProfilePopup(uid);
            } else showToast(String(base).replace("user_", "User ID: "));
        });
    } else if (!isScreen) {
        add(self.pinnedIdentity === base ? "Unpin" : "Pin", "fa-thumbtack", function () {
            self.togglePin(base);
        });
    }
    if (selfIsLocal) {
        /* Self actions only — host-only controls are never shown here. */
        add(this.micOn ? "Mute self" : "Unmute self",
            this.micOn ? "fa-microphone-slash" : "fa-microphone",
            function () { self.toggleMic(); });
        add(this.camOn ? "Hide own video" : "Show own video",
            this.camOn ? "fa-video-slash" : "fa-video",
            function () { self.toggleCam(); });
    }
    const tileVideo = (self.screenVideoOf) ? self.screenVideoOf(tile) : null;
    if (tileVideo) {
        add("Fullscreen", "fa-expand", function () {
            if (tileVideo.requestFullscreen) tileVideo.requestFullscreen();
        });
    }
    /* Host-only actions for REMOTE participants. The gate reads the app's
       server-confirmed host flag; the backend still authorises the actual
       removal (DELETE /participants/{user}) — the menu can never grant
       host powers the server has not confirmed. Screen tiles reuse the
       same gate via their presenter's base identity. */
    if (!selfIsLocal
        && typeof isHost === "function" && isHost()
        && base.indexOf("user_") === 0) {
        add("Spotlight", "fa-star", function () { self.setSpotlight(base); });
        add("View info", "fa-circle-info", function () {
            showToast(base.replace("user_", "User ID: "));
        });
        add("Remove from room", "fa-user-minus", function () {
            if (typeof removeParticipant === "function") {
                removeParticipant(parseInt(base.slice(5), 10) || 0);
            }
        }, "danger");
    }

    if (!menu.children.length) return;
    tile.appendChild(menu);
    const dismiss = function (e) {
        if (!menu.contains(e.target)) {
            self.closeTileMenu();
            document.removeEventListener("click", dismiss);
        }
    };
    setTimeout(function () { document.addEventListener("click", dismiss); }, 0);
};

/* ---- Presentation mode (screen-share aware; connection untouched) ----
   The active screen tile is highlighted via CSS only — the <video> element
   is never re-parented, so the media connection can not be disturbed. */
window.DiscussionMedia.getShareTiles = function () {
    const shares = [];
    this.tiles.forEach(function (t) {
        if (t.isConnected && t.dataset.identity
            && t.dataset.identity.indexOf("#screen") !== -1) {
            shares.push(t);
        }
    });
    return shares;
};

window.DiscussionMedia.getActiveShareTile = function () {
    const shares = this.getShareTiles();
    if (!shares.length) return null;
    if (this.activeShareIdentity) {
        const wanted = this.activeShareIdentity;
        const selected = shares.find(function (t) {
            return t.dataset.identity === wanted;
        });
        if (selected) return selected;
    }
    return shares[shares.length - 1];
};

window.DiscussionMedia.setActiveShare = function (identity) {
    const id = this.baseIdentityOf ? this.baseIdentityOf(identity) : identity;
    /* Accept either a base identity or a full "identity#screen" key. */
    let full = identity || null;
    try {
        if (id && (!full || full.indexOf("#screen") === -1)) full = id + "#screen";
    } catch (e) {}
    this.activeShareIdentity = full;
    this.updateShareSelector();
    this.applyPresentationHighlight();
    try { this.queueLayout(); } catch (e) {}
};

window.DiscussionMedia.applyPresentationHighlight = function () {
    document.querySelectorAll(".lk-tile.lk-presentation").forEach(function (t) {
        t.classList.remove("lk-presentation");
    });
    if (!document.body.classList.contains("presenting")) return;
    const tile = this.getActiveShareTile();
    if (tile) tile.classList.add("lk-presentation");
};

window.DiscussionMedia.togglePresentation = async function () {
    /* Google-Meet-style Present mode: dominant presentation area + compact
       participant strip. Entering requires an active share; exiting restores
       the normal grid. Layout-only — no track re-parenting, no forced
       browser fullscreen (per-share fullscreen stays an explicit menu
       action so Esc/exit semantics stay predictable). */
    const on = !(this.presentMode || document.body.classList.contains("presenting"));
    if (!on) { await this.exitPresentation(); return; }
    const active = this.getActiveShareTile && this.getActiveShareTile();
    if (active && active.dataset && active.dataset.identity
        && (!this.activeShareIdentity || this.activeShareIdentity.indexOf("#screen") === -1)) {
        this.activeShareIdentity = active.dataset.identity;
    }
    if (!this.setPresentMode(true)) {
        /* setPresentMode already toasted "no share active". */
        try { this.syncPresentButtons(); } catch (e) {}
        return;
    }
};

window.DiscussionMedia.exitPresentation = async function () {
    if (this.presentMode) this.setPresentMode(false);
    else {
        document.body.classList.remove("presenting");
        try { this.applyPresentationHighlight(); } catch (e) {}
        try { this.syncPresentButtons(); } catch (e) {}
        try { this.queueLayout(); } catch (e) {}
    }
    /* A per-share native fullscreen (explicit menu action) is the only
       browser fullscreen this feature creates — Esc exits it via the
       fullscreenchange handler below, which calls back here. */
    try {
        if (document.fullscreenElement && document.fullscreenElement.classList
            && document.fullscreenElement.classList.contains("lk-tile")) {
            await document.exitFullscreen();
        }
    } catch (e) { /* user may have exited fullscreen already */ }
};

/* Leaving native fullscreen (Esc) must restore the normal layout. */
document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement && window.DiscussionMedia
        && document.body.classList.contains("presenting")) {
        try { window.DiscussionMedia.exitPresentation(); } catch (e) {}
    }
});

/* ---- Active-share selector (shown only with 2+ simultaneous shares) ---- */
window.DiscussionMedia.updateShareSelector = function () {
    const sel = document.getElementById("shareSelector");
    if (!sel) return;
    const shares = this.getShareTiles();
    if (shares.length < 2) {
        sel.hidden = true;
        sel.innerHTML = "";
        return;
    }
    const active = this.getActiveShareTile();
    sel.hidden = false;
    sel.innerHTML =
        '<span class="share-label"><i class="fa-solid fa-display"></i> Shared screens</span>' +
        shares.map(function (t) {
            const nameEl = t.querySelector(".lk-name");
            const name = (nameEl && nameEl.textContent) || t.dataset.identity;
            const isActive = active && active.dataset.identity === t.dataset.identity;
            const safe = String(name).replace(/[<>&"]/g, "");
            const key = String(t.dataset.identity).replace(/[<>&"]/g, "");
            return '<button type="button" class="share-option ' + (isActive ? "active" : "") +
                '" data-share="' + key + '">' + safe + "</button>";
        }).join("");
};

/* ---- Diagnostics (dev-gated, token-free) ------------------------------
   Enable with ?lkdebug=1 in the Discussion Room URL: logs per-tile media
   state every 5s (identity, video count, readyState, videoWidth/Height,
   paused, muted, fallback label). Never logs tokens, secrets or JWTs.
   Also callable manually: DiscussionMedia.debugTiles() in the console. */
window.DiscussionMedia.debugTiles = function () {
    try {
        const rows = [];
        this.tiles.forEach(function (t, id) {
            const v = t.querySelector(":scope > video");   /* screen/camera video, not the PiP */
            const cs = t.querySelector(".lk-camstate");
            const pipEl = t.querySelector(".lk-pip");
            const pipV = pipEl ? pipEl.querySelector("video.lk-pip-video") : null;
            rows.push({
                tile: id,
                classes: t.className,
                videos: t.querySelectorAll("video").length,
                pip: pipEl ? {
                    state: String(pipEl.className).replace("lk-pip", "").trim(),
                    forIdentity: pipEl.dataset.pipFor || "",
                    videos: pipEl.querySelectorAll("video").length,
                    videoWidth: pipV ? pipV.videoWidth : null,
                    videoHeight: pipV ? pipV.videoHeight : null,
                    readyState: pipV ? pipV.readyState : null,
                    sid: (pipV && pipV._lkTrack && pipV._lkTrack.sid) || null
                } : null,
                readyState: v ? v.readyState : null,
                videoWidth: v ? v.videoWidth : null,
                videoHeight: v ? v.videoHeight : null,
                paused: v ? v.paused : null,
                muted: v ? v.muted : null,
                fallback: cs && cs.style.display !== "none" ? cs.textContent : ""
            });
        });
        console.log("[LiveKit debug] tiles:", rows);
        return rows;
    } catch (e) { return null; }
};
try {
    if (new URLSearchParams(window.location.search).get("lkdebug") === "1"
        && typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", function () {
            setInterval(function () {
                try { window.DiscussionMedia.debugTiles(); } catch (e) {}
            }, 5000);
        });
    }
} catch (e) {}

