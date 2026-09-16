/* tracks + events */
"use strict";
window.DiscussionMedia.attachTrack = function (track, participant, isScreen, force) {
    try {
        if (track.kind === "audio") {
            const el = track.attach();
            el.style.display = "none";
            try { el.autoplay = true; } catch (e) {}
            el.dataset.lkAudio = participant.identity;
            document.body.appendChild(el);
            return;
        }
        if (track.kind !== "video") return;
        const id = participant.identity + (isScreen ? "#screen" : "");
        const tile = this.ensureTile(id, ((isScreen) ? "Screen - " : "") + this.displayName(participant, "?"), !!participant.isLocal && !isScreen);
        if (!tile) return;
        if (isScreen && !tile.querySelector(".lk-screen-tag")) {
            const tag = document.createElement("div");
            tag.className = "lk-screen-tag";
            tag.textContent = "SCREEN";
            tile.appendChild(tag);
        }
        if (isScreen) tile.classList.add("is-share-tile");
        /* Idempotent attach: the same track arriving via TrackPublished AND
           TrackSubscribed must not churn the element (detach/prepend/play
           churn freezes frames at 0x0). */
        const sid = this.trackSidOf(track, participant, isScreen);
        const existing = this.screenVideoOf(tile);
        const liveMedia = track && track.mediaStreamTrack;
        const trackEnded = !!(liveMedia && liveMedia.readyState === "ended");
        if (!force && !trackEnded && existing
            && existing.dataset.lkSid && sid && existing.dataset.lkSid === sid) {
            /* Same live track is already attached — refresh state only. */
            try { existing.dataset.lkDead = ""; } catch (e) {}
            this.bindVideoElement(existing, participant, isScreen);
            if (isScreen) this.paintShareTile(tile, participant);
            else this.paintTile(participant);
            try { this.queueLayout(); } catch (e) {}
            return;
        }
        /* `force` (local camera re-enable path) drops any stale <video>
           first: LiveKit may hand back the same element, which can stay
           frozen at 0x0 if it was attached to the stopped capture. */
        if (force) {
            /* Drop stale direct-child videos only — a presenter camera PiP
               <video> inside .lk-pip is never a stale tile element. */
            try {
                tile.querySelectorAll("video").forEach(function (v) {
                    try { if (!v.closest || !v.closest(".lk-pip")) v.remove(); } catch (e) {}
                });
            } catch (e) {}
        }
        const el = track.attach();
        try { if (el && sid) el.dataset.lkSid = sid; } catch (e) {}
        /* LiveKit may return an element that is already attached to this
           tile; avoid duplicating it, then guarantee exactly one <video>. */
        const old = this.screenVideoOf(tile);
        if (old && old !== el) old.remove();
        if (el.parentNode !== tile) tile.prepend(el);
        this.dedupeVideos(tile);
        this.bindVideoElement(el, participant, isScreen);
        /* A freshly attached element can sit paused at 0x0 until play() is
           explicitly kicked (autoplay policies / re-attach). Local preview
           is muted so it can always play. */
        try {
            el.playsInline = true;
            el.autoplay = true;
            if (participant && participant.isLocal) el.muted = true;
            const pr = el.play();
            if (pr && pr.catch) pr.catch(function () {});
        } catch (e) {}
        if (!isScreen) this.paintTile(participant);
        else {
            this.paintShareTile(tile, participant);
            if (this.updateShareSelector) this.updateShareSelector();
        }
        try { this.queueLayout(); } catch (e) {}
        try { this.paintTile(participant); } catch (e) {}
        try { this.refreshShareTiles(); } catch (e) {}
    } catch (e) { console.log("[LiveKit] attach skipped"); }
};

/* Track identity for idempotent attaches. Uses the publication SID when
   available (stable across subscribe/unsubscribe round-trips). */
window.DiscussionMedia.trackSidOf = function (track, participant, isScreen) {
    try {
        if (track && track.sid) return String(track.sid);
        if (track && track.mediaStreamTrack && track.mediaStreamTrack.id) {
            return "ms-" + track.mediaStreamTrack.id;
        }
    } catch (e) {}
    return null;
};

/* Defensive: a tile must never accumulate stale <video> children. The
   presenter camera PiP video lives inside .lk-pip and is managed by
   refreshPresenterPiP — dedupe must never count or remove it. */
window.DiscussionMedia.dedupeVideos = function (tile) {
    try {
        if (!tile) return;
        const vids = Array.prototype.filter.call(
            tile.querySelectorAll("video"),
            function (v) {
                try { return !(v.closest && v.closest(".lk-pip")); }
                catch (e) { return true; }
            });
        if (vids.length > 1) {
            for (let i = vids.length - 1; i > 0; i--) {
                try { vids[i].remove(); } catch (e) {}
            }
        }
    } catch (e) {}
};

/* One-time media-state listeners per element (dataset flag = no duplicate
   listeners). A dead/empty element yields the avatar fallback; the first
   frame promotes the video — no empty borders. */
window.DiscussionMedia.bindVideoElement = function (el, participant, isScreen) {
    try {
        if (!el || el.dataset.lkBound === "1") return;
        el.dataset.lkBound = "1";
        const self = this;
        const id = participant ? participant.identity : null;
        const reevaluate = function () {
            try {
                if (id && isScreen) {
                    const t = self.tiles.get(id + "#screen");
                    if (t) self.paintShareTile(t, participant);
                } else if (id && self.paintTile) {
                    self.paintTile(participant);
                }
                if (self.queueLayout) self.queueLayout();
            } catch (e) {}
        };
        ["loadedmetadata", "loadeddata", "playing", "resize"].forEach(function (ev) {
            el.addEventListener(ev, function () {
                try { el.dataset.lkDead = ""; } catch (e) {}
                reevaluate();
            });
        });
        el.addEventListener("emptied", function () {
            try { el.dataset.lkDead = "1"; } catch (e) {}
            reevaluate();
        });
        el.addEventListener("error", function () {
            try { el.dataset.lkDead = "1"; } catch (e) {}
            reevaluate();
        });
    } catch (e) {}
};
window.DiscussionMedia.ensureParticipantTile = function (identity, name, isLocal) {
    /* Restore a participant's own tile when their screen share stops but
       their camera tile is gone — nobody may vanish from the grid (D5). */
    try {
        const t = this.ensureTile(identity, name, !!isLocal);
        const p = this.participantFor ? this.participantFor(identity) : null;
        if (t && p && this.paintTile) this.paintTile(p);
        try { this.queueLayout(); } catch (e) {}
        return t;
    } catch (e) { return null; }
};

window.DiscussionMedia.detachIdentity = function (identity) {
    const self = this;
    ["", "#screen"].forEach(function (s) {
        const t = self.tiles.get(identity + s);
        if (t) {
            /* Release the presenter camera PiP before the share tile goes. */
            try { self.clearPresenterPiP(t); } catch (e) {}
            t.remove(); self.tiles.delete(identity + s);
        }
    });
    document.querySelectorAll('[data-lk-audio="' + identity + '"]').forEach(function (el) { el.remove(); });
    const g = document.getElementById("livekitGrid");
    if (g && !g.firstChild) {
        const d = document.createElement("div");
        d.className = "lk-empty";
        d.textContent = "No live video yet. Turn your camera on or invite someone to join.";
        g.appendChild(d);
    }
};
