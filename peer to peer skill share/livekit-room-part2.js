/* tracks + events */
"use strict";
window.DiscussionMedia.attachTrack = function (track, participant, isScreen, force) {
    try {
        if (track.kind === "audio") {
            const el = track.attach();
            el.style.display = "none";
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
        /* `force` (local camera re-enable path) drops any stale <video>
           first: LiveKit may hand back the same element, which can stay
           frozen at 0x0 if it was attached to the stopped capture. */
        if (force) {
            try { tile.querySelectorAll("video").forEach(function (v) { v.remove(); }); } catch (e) {}
        }
        const el = track.attach();
        /* LiveKit may return an element that is already attached to this
           tile; avoid duplicating it, then guarantee exactly one <video>. */
        const old = tile.querySelector("video");
        if (old && old !== el) old.remove();
        if (el.parentNode !== tile) tile.prepend(el);
        /* A freshly attached element can sit paused at 0x0 until play() is
           explicitly kicked (autoplay policies / re-attach). Local preview
           is muted so it can always play. */
        try {
            el.playsInline = true;
            if (participant && participant.isLocal) el.muted = true;
            const pr = el.play();
            if (pr && pr.catch) pr.catch(function () {});
        } catch (e) {}
        if (!isScreen) this.paintTile(participant);
    } catch (e) { console.log("[LiveKit] attach skipped"); }
};
window.DiscussionMedia.detachIdentity = function (identity) {
    const self = this;
    ["", "#screen"].forEach(function (s) {
        const t = self.tiles.get(identity + s);
        if (t) { t.remove(); self.tiles.delete(identity + s); }
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
