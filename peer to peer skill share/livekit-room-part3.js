/* events + connect */
"use strict";
window.DiscussionMedia.wireEvents = function (room) {
    const Lk = window.LivekitClient;
    const self = this;
    room.on(Lk.RoomEvent.ParticipantConnected, function (p) {
        console.log("[LiveKit] Participant joined", p.identity);
        self.ensureTile(p.identity, self.displayName(p, "?"), false);
        self.paintTile(p);
        self.setStatus("CONNECTED", self.countLabel());
        if (typeof showToast === "function") {
            showToast(self.displayName(p, "Someone") + " joined the room");
        }
        /* Participant-level events (incl. remote metadata/hand state) are
           wired per participant, because the 2.9.4 SDK reports them on the
           participant object â€” see ParticipantEventCallbacks. */
        try { self.wireParticipantEvents(p); } catch (e) {}
        /* Existing remote tracks (already published before we joined) are
           restored by connect(); wire their participants too. */
        try {
            if (self.room && self.room.remoteParticipants) {
                self.room.remoteParticipants.forEach(function (rp) {
                    try { self.wireParticipantEvents(rp); } catch (e) {}
                });
            }
        } catch (e) {}
    });
    room.on(Lk.RoomEvent.ParticipantDisconnected, function (p) {
        console.log("[LiveKit] Participant left", p.identity);
        try { p.getTrackPublications().forEach(function (pub) { try { pub.track && pub.track.detach().forEach(function (el) { el.remove(); }); } catch (e) {} }); } catch (e) {}
        self.detachIdentity(p.identity);
        self.setStatus("CONNECTED", self.countLabel());
        if (typeof showToast === "function") {
            showToast(self.displayName(p, "Someone") + " left the room");
        }
    });
    room.on(Lk.RoomEvent.TrackSubscribed, function (track, pub, p) {
        console.log("[LiveKit] Track subscribed", track.kind, p.identity);
        self.attachTrack(track, p, track.source === Lk.Track.Source.ScreenShare);
        self.setStatus("CONNECTED", self.countLabel());
        try { self.queueLayout(); } catch (e) {}
    });
    room.on(Lk.RoomEvent.TrackUnsubscribed, function (track, pub, p) {
        console.log("[LiveKit] Track unsubscribed", track.kind);
        try { track.detach().forEach(function (el) { el.remove(); }); } catch (e) {}
        /* A camera (mute/unpublish) may leave a sibling <video> behind on an
           older element â€” the tile must keep exactly one. */
        try {
            if (pub && pub.kind !== "audio" && pub.source === Lk.Track.Source.Camera
                && self.dedupeVideos) {
                const ct = self.tiles.get(p.identity);
                if (ct) self.dedupeVideos(ct);
            }
        } catch (e) {}
        try {
            if (pub && pub.source === Lk.Track.Source.ScreenShare) {
                /* A stopped sharing: remove the screen tile, keep the
                   participant's own camera tile. */
                const sid = p.identity + "#screen";
                const st = self.tiles.get(sid);
                if (st) {
                    try { self.clearPresenterPiP(st); } catch (e) {}
                    st.remove(); self.tiles.delete(sid);
                }
                if (self.presentOrder) {
                    self.presentOrder = self.presentOrder.filter(function (id) { return id !== sid; });
                }
                if (self.activeShareIdentity === sid) self.activeShareIdentity = null;
                if (self.updateShareSelector) self.updateShareSelector();
                self.setStatus("CONNECTED", self.countLabel());
                /* The presenter must stay represented (avatar state if the
                   camera tile is gone) â€” never an empty grid slot. */
                if (!self.tiles.get(p.identity) && self.ensureParticipantTile) {
                    self.ensureParticipantTile(p.identity, self.displayName(p, "?"), !!p.isLocal);
                }
                try { self.queueLayout(); } catch (e) {}
                try { self.refreshShareTiles(); } catch (e) {}
                return;
            }
        } catch (e) {}
        self.paintAll();
        try { self.queueLayout(); } catch (e) {}
    });
    /* A camera (or screen) toggled back on produces a NEW publication. Wire
       the published/unpublished events so tiles update deterministically
       instead of waiting for a subscription round-trip. */
    room.on(Lk.RoomEvent.TrackPublished, function (pub, p) {
        try {
            if (pub && pub.source === Lk.Track.Source.Camera && pub.track) {
                self.attachTrack(pub.track, p, false);
            }
            if (pub && pub.source === Lk.Track.Source.ScreenShare && !p.isLocal
                && typeof showToast === "function") {
                showToast(self.displayName(p, "Someone") + " started sharing their screen");
            }
            self.paintTile(p);
        } catch (e) {}
        self.setStatus("CONNECTED", self.countLabel());
    });
    room.on(Lk.RoomEvent.TrackUnpublished, function (pub, p) {
        console.log("[LiveKit] Track unpublished", pub && pub.source, p && p.identity);
        try {
            if (pub && pub.source === Lk.Track.Source.ScreenShare) {
                const sid = p.identity + "#screen";
                const st = self.tiles.get(sid);
                if (st) {
                    try { self.clearPresenterPiP(st); } catch (e) {}
                    st.remove(); self.tiles.delete(sid);
                }
                if (self.presentOrder) {
                    self.presentOrder = self.presentOrder.filter(function (id) { return id !== sid; });
                }
                if (self.activeShareIdentity === sid) self.activeShareIdentity = null;
                if (self.updateShareSelector) self.updateShareSelector();
                if (!self.tiles.get(p.identity) && self.ensureParticipantTile) {
                    self.ensureParticipantTile(p.identity, self.displayName(p, "?"), !!p.isLocal);
                }
            } else if (pub && pub.kind === "video" && pub.track) {
                try { pub.track.detach().forEach(function (el) { el.remove(); }); } catch (e) {}
            }
        } catch (e) {}
        try { self.paintAll(); } catch (e) {}
        try { self.queueLayout(); } catch (e) {}
    });
    room.on(Lk.RoomEvent.TrackMuted, function (pub, p) {
        /* A muted camera (publication retained) must become an honest avatar
           fallback â€” never an empty tile (RC-1). paintAll() derives the
           avatar/video state; the PiP mirrors it for presenters. */
        try {
            if (pub && pub.kind !== "audio"
                && pub.source === Lk.Track.Source.ScreenShare && p && !p.isLocal
                && !self.tiles.get(p.identity) && self.ensureParticipantTile) {
                self.ensureParticipantTile(p.identity, self.displayName(p, "?"), false);
            }
        } catch (e) {}
        self.paintAll();
        try { self.refreshShareTiles(); } catch (e) {}
        try { self.queueLayout(); } catch (e) {}
    });
    room.on(Lk.RoomEvent.TrackUnmuted, function (pub, p) {
        try {
            /* Local camera re-enabled: force a fresh <video> + play() so the
               preview recovers even if the reused element is frozen at 0x0.
               Remote tiles are left to the subscribe/published handlers. */
            if (p && p.isLocal && pub && pub.source === Lk.Track.Source.Camera && pub.track) {
                const mt = pub.track.mediaStreamTrack;
                if (!mt || mt.readyState !== "ended") self.attachTrack(pub.track, p, false, true);
            }
        } catch (e) {}
        try { self.paintAll(); } catch (e) {}
        try { self.queueLayout(); } catch (e) {}
        self.setStatus("CONNECTED", self.countLabel());
    });
    /* Local media lifecycle (previous behaviour relied only on manual
       queries + a single retry after toggling). Idempotent: publication
       handlers just (re)attach the same track via data-lk-sid. */
    room.on(Lk.RoomEvent.LocalTrackPublished, function (pub) {
        try {
            if (!pub || !self.local) return;
            if (pub.source === Lk.Track.Source.Camera && pub.track) {
                self.camOn = true;
                self.attachTrack(pub.track, self.local, false);
            } else if (pub.source === Lk.Track.Source.ScreenShare && pub.track) {
                self.sharing = true;
                self.attachTrack(pub.track, self.local, true);
            }
            try { self.syncButtons(); } catch (e) {}
            try { self.queueLayout(); } catch (e) {}
        } catch (e) {}
    });
    room.on(Lk.RoomEvent.LocalTrackUnpublished, function (pub) {
        try {
            if (!pub || !self.local) return;
            if (pub.source === Lk.Track.Source.ScreenShare) {
                const sid = self.local.identity + "#screen";
                const st = self.tiles.get(sid);
                if (st) {
                    /* Release the presenter camera PiP before the share tile
                       goes — otherwise the PiP <video> would stay attached to
                       the (still live) camera track as an orphan element. */
                    try { self.clearPresenterPiP(st); } catch (e) {}
                    st.remove(); self.tiles.delete(sid);
                }
                if (self.presentOrder) {
                    self.presentOrder = self.presentOrder.filter(function (id) { return id !== sid; });
                }
                if (self.activeShareIdentity === sid) self.activeShareIdentity = null;
                self.sharing = false;
                if (self.updateShareSelector) self.updateShareSelector();
                try { self.queueLayout(); } catch (e) {}
            } else if (pub.source === Lk.Track.Source.Camera) {
                self.camOn = false;
                const ct = self.tiles.get(self.local.identity);
                if (ct) {
                    try { ct.querySelectorAll("video").forEach(function (v) { v.remove(); }); } catch (e) {}
                    try { self.paintTile(self.local); } catch (e) {}
                }
                try { self.syncButtons(); } catch (e) {}
                try { self.queueLayout(); } catch (e) {}
            }
        } catch (e) {}
    });
    room.on(Lk.RoomEvent.ActiveSpeakersChanged, function (speakers) {
        try {
            self.tiles.forEach(function (t) { t.classList.remove("speaking"); });
            speakers.forEach(function (s) { const t = self.tiles.get(s.identity); if (t) t.classList.add("speaking"); });
        } catch (e) {}
    });
    room.on(Lk.RoomEvent.Reconnecting, function () {
        console.log("[LiveKit] Reconnecting");
        self.setStatus("RECONNECTING", "Reconnecting...");
        if (typeof showToast === "function") {
            showToast("Connection lost â€” reconnectingâ€¦", true);
        }
    });
    room.on(Lk.RoomEvent.Reconnected, function () {
        console.log("[LiveKit] Reconnected");
        self.setStatus("CONNECTED", self.countLabel());
        /* Rebuild presentation state from current publications only (no
           assumptions â€” stale tiles were already pruned by disconnect). */
        try { self.paintAll(); } catch (e) {}
        try { self.queueLayout(); } catch (e) {}
        if (typeof showToast === "function") {
            showToast("Reconnected to the live room.");
        }
    });
    /* Raise-hand is synced through participant metadata (a real LiveKit
       mechanism) so every participant sees the same hand state. In
       livekit-client 2.9.4 this event is emitted on the PARTICIPANT
       object (ParticipantEventCallbacks.participantMetadataChanged), not
       on the RoomEvent enum â€” so it is wired per participant above and
       for already-present remotes right after connect(). */
    room.on(Lk.RoomEvent.ParticipantMetadataChanged, function (metadata, p) {
        try {
            const tile = self.tiles.get(p.identity);
            if (!tile) return;
            self.paintHandFlag(tile, p, metadata);
        } catch (e) {}
    });
    room.on(Lk.RoomEvent.Disconnected, function () {
        console.log("[LiveKit] Disconnected");
        self.connected = false;
        self.setStatus("DISCONNECTED", "Disconnected.");
    });
    room.on(Lk.RoomEvent.ConnectionStateChanged, function (st) {
        console.log("[LiveKit] Connection state:", st);
    });
};

/* Shared hand-flag painter (used by the room-level and the per-participant
   metadata handlers below). */
window.DiscussionMedia.paintHandFlag = function (tile, p, metadata) {
    try {
        let hand = tile.querySelector('[data-f="hand"]');
        if (metadata === "hand_raised") {
            if (!hand) {
                hand = document.createElement("span");
                hand.dataset.f = "hand";
                hand.title = "Hand raised";
                hand.innerHTML = '<i class="fa-regular fa-hand"></i>';
                tile.querySelector(".lk-flags").appendChild(hand);
            }
            hand.classList.add("raised");
            if (!p.isLocal && typeof showToast === "function") {
                showToast(this.displayName(p, "Someone") + " raised their hand");
            }
        } else if (hand) {
            hand.classList.remove("raised");
        }
    } catch (e) {}
};

/* Per-participant metadata wiring for livekit-client 2.9.4: the SDK emits
   participantMetadataChanged on the participant object with signature
   (prevMetadata, participant?). Guarded per-participant so repeat wiring
   never stacks duplicate listeners. */
window.DiscussionMedia.wireParticipantEvents = function (p) {
    try {
        if (!p || !p.on || p._handWired) return;
        p._handWired = true;
        const self = this;
        p.on("participantMetadataChanged", function (prevMetadata, who) {
            try {
                const whoP = who || p;
                const tile = self.tiles.get(whoP.identity);
                if (!tile) return;
                self.paintHandFlag(tile, whoP, whoP.metadata);
            } catch (e) {}
        });
    } catch (e) {}
};
window.DiscussionMedia.connect = async function (appRoomId) {
    if (this.room || this._busy) return;
    this._busy = true;
    try {
        const Lk = window.LivekitClient;
        if (!Lk || !Lk.Room) {
            this.setStatus("ERROR", "Live media library failed to load. Chat still works. [Retry]");
            return;
        }
        this.setStatus("CONNECTING", "Connecting to live room...");
        console.log("[LiveKit] Requesting token");
        const data = await window.SkillShareAPI.getLivekitToken(appRoomId);
        console.log("[LiveKit] Token received");
        if (!data || !data.server_url || !data.participant_token) throw new Error("Live media unavailable.");
        const room = new Lk.Room({ adaptiveStream: true, dynacast: true });
        this.wireEvents(room);
        console.log("[LiveKit] Connecting");
        await room.connect(data.server_url, data.participant_token);
        this.room = room;
        this.local = room.localParticipant;
        console.log("[LiveKit] Connected");
        let me = "You";
        try { if (typeof currentUser !== "undefined" && currentUser && currentUser.name) me = currentUser.name; } catch (e) {}
        this.ensureTile(this.local.identity, me, true);
        this.paintTile(this.local);
        const self = this;
        try {
            const remotes = this.room && this.room.remoteParticipants ? Array.from(this.room.remoteParticipants.values()) : [];
            remotes.forEach(function (p) {
            self.ensureTile(p.identity, self.displayName(p, "?"), false);
            try { self.wireParticipantEvents(p); } catch (e) {}
            p.getTrackPublications().forEach(function (pub) {
                if (pub.track && pub.kind === "video") self.attachTrack(pub.track, p, pub.source === Lk.Track.Source.ScreenShare);
                else if (pub.track && pub.kind === "audio") self.attachTrack(pub.track, p, false);
            });
            self.paintTile(p);
        });
        } catch (e) { console.log("[LiveKit] Existing remote restore failed:", e); }
        this.setStatus("CONNECTED", this.countLabel());
        /* Publish REAL microphone + camera so mute/camera controls and
           remote participants see real state. Permission errors degrade
           gracefully: the room stays usable (audio-only / chat). */
        try {
            await this.local.setMicrophoneEnabled(true);
            this.micOn = true;
            console.log("[LiveKit] Microphone published");
        } catch (e) {
            this.micOn = false;
            console.log("[LiveKit] Microphone unavailable:", (e && e.name) || e);
            showToast("Microphone unavailable â€” you can still listen and chat.", true);
        }
        try {
            await this.local.setCameraEnabled(true);
            this.camOn = true;
            try {
                const pub = this.local.getTrackPublication(Lk.Track.Source.Camera);
                if (pub && pub.track) this.attachTrack(pub.track, this.local, false);
            } catch (e) {}
            console.log("[LiveKit] Camera published");
        } catch (e) {
            this.camOn = false;
            console.log("[LiveKit] Camera unavailable:", (e && e.name) || e);
            showToast("Camera unavailable â€” the room stays usable.", true);
        }
        this.syncButtons();
        this.paintAll();
    } catch (err) {
        const msg = (err && (err.detail || err.message)) || "Connection failed";
        console.log("[LiveKit] Connection failed:", msg);
        this.setStatus("ERROR", msg + "  Chat still works. [Retry]");
    } finally { this._busy = false; }
};
