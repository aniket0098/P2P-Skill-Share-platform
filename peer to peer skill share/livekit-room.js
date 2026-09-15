/* SKILLCONNECT — LIVE MEDIA (LiveKit Cloud), part 1/3.
   App room <id> -> "skillshare_discussion_<id>". Identity "user_<id>".
   No secrets here: browser only gets server_url + short-lived token. */
"use strict";

window.DiscussionMedia = window.DiscussionMedia || {
    connected: false,
    room: null,
    local: null,
    micOn: false,
    camOn: false,
    sharing: false,
    tiles: new Map(),
    _busy: false,
    /* Real head-count of the APPLICATION room (PostgreSQL participant
       list). LiveKit only knows about media peers that have finished the
       handshake, so the status line must never claim "just you" while the
       discussion really has more members. */
    appCount: 0,

    getRoomName(roomId) { return "skillshare_discussion_" + roomId; },

    els() {
        return {
            pill: document.getElementById("livekitState"),
            line: document.getElementById("livekitStatusline"),
            retry: document.getElementById("livekitRetryBtn"),
            grid: document.getElementById("livekitGrid"),
        };
    },

    setStatus(mode, text) {
        const { pill, line, retry } = this.els();
        if (pill) {
            pill.textContent = mode;
            pill.classList.toggle("ok", mode === "CONNECTED");
            pill.classList.toggle("bad", mode === "ERROR" || mode === "DISCONNECTED");
        }
        if (line) line.textContent = text || "";
        if (retry) retry.hidden = mode !== "ERROR";
        this.connected = mode === "CONNECTED";
    },

    countLabel() {
        const live = this.room ? this.room.remoteParticipants.size + 1 : 0;
        const n = Math.max(live, this.appCount || 0);
        return n <= 1 ? "Connected \u2022 just you" : "Connected \u2022 " + n + " participants";
    },

    /* Called by discussion-room.js whenever the real participant list is
       rendered, so CONNECTED always reports the true room head-count. */
    setAppCount(n) {
        const next = Math.max(0, parseInt(n, 10) || 0);
        if (next === this.appCount) return;
        this.appCount = next;
        if (this.connected) this.setStatus("CONNECTED", this.countLabel());
    },

    displayName(p, fb) {
        try { return p.name || p.identity || fb || "Participant"; }
        catch (e) { return fb || "Participant"; }
    },

    micOnOf(p) {
        try {
            if (p.isLocal && !this.micOn) return false;
            return p.isMicrophoneEnabled !== false;
        } catch (e) { return true; }
    },

    camOnOf(p) {
        try {
            if (p.isLocal) return !!this.camOn;
            /* Remote camera state: a re-enabled camera arrives as a brand-new
               publication, so the publication is the authoritative signal —
               an early/stale `isCameraEnabled === false` must never mask a
               live published camera track (that would show "camera off" over
               a real, playing video). */
            if (p.isCameraEnabled === true) return true;
            const Lk = window.LivekitClient;
            const pub = (p.getTrackPublication && Lk)
                ? p.getTrackPublication(Lk.Track.Source.Camera) : null;
            return !!(pub && !pub.isMuted);
        } catch (e) { return false; }
    },

    ensureTile(identity, name, isLocal) {
        const { grid } = this.els();
        if (!grid) return null;
        const empty = grid.querySelector(".lk-empty");
        if (empty) empty.remove();
        let tile = this.tiles.get(identity);
        if (tile && tile.isConnected) return tile;
        tile = document.createElement("div");
        tile.className = "lk-tile";
        tile.dataset.identity = identity;
        const av = document.createElement("div");
        av.className = "lk-avatar";
        av.textContent = (typeof initialsOf === "function") ? initialsOf(name) : "?";
        tile.appendChild(av);
        const flags = document.createElement("div");
        flags.className = "lk-flags";
        flags.innerHTML = '<span data-f="mic" title="Microphone"><i class="fa-solid fa-microphone"></i></span>' +
            '<span data-f="cam" title="Camera"><i class="fa-solid fa-video"></i></span>';
        tile.appendChild(flags);
        const label = document.createElement("div");
        label.className = "lk-name";
        label.textContent = (name || identity) + (isLocal ? " (you)" : "");
        tile.appendChild(label);
        grid.appendChild(tile);
        this.tiles.set(identity, tile);
        return tile;
    },

    paintTile(p) {
        const tile = this.tiles.get(p.identity);
        if (!tile) return;
        const name = this.displayName(p, "Participant");
        const label = tile.querySelector(".lk-name");
        if (label) label.textContent = name + (p.isLocal ? " (you)" : "");
        const av = tile.querySelector(".lk-avatar");
        if (av) {
            av.textContent = (typeof initialsOf === "function") ? initialsOf(name) : "?";
            av.style.display = tile.querySelector("video") ? "none" : "grid";
        }
        const mic = tile.querySelector('[data-f="mic"]');
        const cam = tile.querySelector('[data-f="cam"]');
        const m = this.micOnOf(p), c = this.camOnOf(p);
        if (mic) {
            mic.classList.toggle("off", !m);
            mic.innerHTML = '<i class="fa-solid fa-microphone' + (m ? "" : "-slash") + '"></i>';
        }
        if (cam) {
            cam.classList.toggle("off", !c);
            cam.innerHTML = '<i class="fa-solid fa-video' + (c ? "" : "-slash") + '"></i>';
        }
        /* A disabled remote camera leaves its last frame frozen on screen —
           hide it so "camera off" is visually honest, and reveal it again on
           re-enable (a fresh track is re-attached by the event handlers). */
        const v = tile.querySelector("video");
        if (v) v.style.visibility = c ? "" : "hidden";
    },

    paintAll() {
        try {
            if (this.local) this.paintTile(this.local);
            if (this.room) this.room.remoteParticipants.forEach((p) => this.paintTile(p));
        } catch (e) {}
    },
};
