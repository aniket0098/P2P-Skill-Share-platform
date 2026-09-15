/* controls: mic/cam/screen/disconnect */
"use strict";
window.DiscussionMedia.syncButtons = function () {
    const mic = document.getElementById("micBtn");
    const cam = document.getElementById("camBtn");
    const scr = document.getElementById("screenBtn");
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
            if (tile) { tile.remove(); this.tiles.delete(this.local.identity + "#screen"); }
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
    this._busy = false;
    try {
        this.tiles.forEach(function (t) { try { t.remove(); } catch (e) {} });
        this.tiles.clear();
    } catch (e) {}
};
