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
    });
    room.on(Lk.RoomEvent.ParticipantDisconnected, function (p) {
        console.log("[LiveKit] Participant left", p.identity);
        try { p.getTrackPublications().forEach(function (pub) { try { pub.track && pub.track.detach().forEach(function (el) { el.remove(); }); } catch (e) {} }); } catch (e) {}
        self.detachIdentity(p.identity);
        self.setStatus("CONNECTED", self.countLabel());
    });
    room.on(Lk.RoomEvent.TrackSubscribed, function (track, pub, p) {
        console.log("[LiveKit] Track subscribed", track.kind, p.identity);
        self.attachTrack(track, p, track.source === Lk.Track.Source.ScreenShare);
        self.setStatus("CONNECTED", self.countLabel());
    });
    room.on(Lk.RoomEvent.TrackUnsubscribed, function (track, pub, p) {
        console.log("[LiveKit] Track unsubscribed", track.kind);
        try { track.detach().forEach(function (el) { el.remove(); }); } catch (e) {}
        try {
            if (pub && pub.source === Lk.Track.Source.ScreenShare) {
                /* A stopped sharing: remove the screen tile, keep the
                   participant's own camera tile. */
                const sid = p.identity + "#screen";
                const st = self.tiles.get(sid);
                if (st) { st.remove(); self.tiles.delete(sid); }
                self.setStatus("CONNECTED", self.countLabel());
                return;
            }
        } catch (e) {}
        self.paintAll();
    });
    /* A camera (or screen) toggled back on produces a NEW publication. Wire
       the published/unpublished events so tiles update deterministically
       instead of waiting for a subscription round-trip. */
    room.on(Lk.RoomEvent.TrackPublished, function (pub, p) {
        try {
            if (pub && pub.source === Lk.Track.Source.Camera && pub.track) {
                self.attachTrack(pub.track, p, false);
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
                if (st) { st.remove(); self.tiles.delete(sid); }
            } else if (pub && pub.kind === "video" && pub.track) {
                try { pub.track.detach().forEach(function (el) { el.remove(); }); } catch (e) {}
            }
        } catch (e) {}
        try { self.paintAll(); } catch (e) {}
    });
    room.on(Lk.RoomEvent.TrackMuted, function () { self.paintAll(); });
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
        self.setStatus("CONNECTED", self.countLabel());
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
    });
    room.on(Lk.RoomEvent.Reconnected, function () {
        console.log("[LiveKit] Reconnected");
        self.setStatus("CONNECTED", self.countLabel());
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
            showToast("Microphone unavailable — you can still listen and chat.", true);
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
            showToast("Camera unavailable — the room stays usable.", true);
        }
        this.syncButtons();
        this.paintAll();
    } catch (err) {
        const msg = (err && (err.detail || err.message)) || "Connection failed";
        console.log("[LiveKit] Connection failed:", msg);
        this.setStatus("ERROR", msg + "  Chat still works. [Retry]");
    } finally { this._busy = false; }
};
