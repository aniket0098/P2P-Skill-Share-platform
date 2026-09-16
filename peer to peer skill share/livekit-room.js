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
    /* Meeting-experience state (additive; no LiveKit behavior changed):
       handRaised       — local raise-hand flag (synced via participant metadata)
       pinnedIdentity   — locally pinned tile (layout-only, no server effect)
       spotlightIdentity— host spotlight (layout-only)
       activeShareIdentity — which "#screen" tile presentation mode shows */
    handRaised: false,
    pinnedIdentity: null,
    spotlightIdentity: null,
    activeShareIdentity: null,
    /* Presentation layout state (layout-only; never touches LiveKit
       connection, publish/subscribe, or authentication). */
    presentMode: false,
    presentOrder: [],
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
        /* Three-dot menu for every tile, including screen shares (the menu
           itself resolves "identity#screen" back to the presenter and reuses
           the existing participant actions — no second moderation system). */
        {
            const menuBtn = document.createElement("button");
            menuBtn.className = "lk-menu-btn";
            menuBtn.type = "button";
            menuBtn.setAttribute("aria-label", "Participant options");
            menuBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
            const self = this;
            menuBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                self.openTileMenu(tile, identity, isLocal);
            });
            tile.appendChild(menuBtn);
        }
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
        /* Single derived media state — the avatar and the video are NEVER
           both hidden. A retained-but-muted/ended track yields an honest
           avatar fallback instead of an empty bordered box (RC-1). */
        const v = tile.querySelector("video");
        const camLive = !!(v && c && v.dataset.lkDead !== "1");
        const av = tile.querySelector(".lk-avatar");
        if (av) {
            av.textContent = (typeof initialsOf === "function") ? initialsOf(name) : "?";
            av.style.display = camLive ? "none" : "grid";
        }
        if (v) v.style.visibility = camLive ? "" : "hidden";
        tile.classList.toggle("cam-off", !camLive);
        tile.classList.toggle("has-live-video", camLive);
        this.refreshCamStateLabel(tile, camLive, c, !!v);
        /* Presenter PiP: whenever this participant's camera state changes and
           they have a live screen share, the presentation PiP must mirror the
           REAL camera track (video <-> avatar). The camera tile keeps its own
           <video> element — nothing is re-parented or detached here. */
        try {
            const shareTile = this.tiles.get(p.identity + "#screen");
            if (shareTile) this.syncPresenterPiP(shareTile, p.identity);
        } catch (e) {}
    },

    /* Informative fallback inside the tile (CONNECTING / CAMERA OFF /
       VIDEO UNAVAILABLE) — never an empty container. */
    refreshCamStateLabel(tile, camLive, camOn, hasVideo) {
        try {
            let s = tile.querySelector(":scope > .lk-camstate");
            if (!s) {
                s = document.createElement("div");
                s.className = "lk-camstate";
                s.setAttribute("aria-hidden", "true");
                tile.appendChild(s);
            }
            const text = camLive ? "" : (!camOn ? "Camera off" : (hasVideo ? "Video unavailable" : "Connecting\u2026"));
            if (s.textContent !== text) s.textContent = text;
            s.style.display = text ? "" : "none";
        } catch (e) {}
    },

    participantFor(baseIdentity) {
        try {
            if (this.local && this.local.identity === baseIdentity) return this.local;
            if (this.room && this.room.remoteParticipants) {
                const rp = this.room.remoteParticipants.get(baseIdentity);
                if (rp) return rp;
            }
        } catch (e) {}
        return null;
    },

    /* Screen tiles get their own painter: the stray avatar left over from
       ensureTile must never sit next to the presentation video (RC-3). */
    paintShareTile(tile, p) {
        try {
            if (!tile) return;
            /* The screen <video> is always a DIRECT child of the tile
               (attachTrack prepends it). The presenter camera PiP video is
               nested inside .lk-pip and must never be mistaken for it. */
            const v = (this.screenVideoOf)
                ? this.screenVideoOf(tile)
                : tile.querySelector(":scope > video");
            const live = !!(v && v.dataset.lkDead !== "1");
            const av = tile.querySelector(".lk-avatar");
            if (av) av.style.display = live ? "none" : "grid";
            tile.classList.toggle("has-live-video", live);
            tile.classList.toggle("cam-off", !live);
            const label = tile.querySelector(".lk-name");
            if (label && p) {
                const nm = this.displayName(p, "Participant");
                label.textContent = nm + (p.isLocal ? " (you)" : "") + " \u2014 Screen";
            }
            this.refreshCamStateLabel(tile, live, true, !!v);
            const s = tile.querySelector(":scope > .lk-camstate");
            if (s && !live) {
                const fallback = v ? "Screen unavailable" : "Connecting\u2026";
                if (s.textContent !== fallback) s.textContent = fallback;
            }
            /* Keep the presenter camera PiP in sync with this share tile. */
            this.syncPresenterPiP(tile, this.baseIdentityOf(tile.dataset.identity));
        } catch (e) {}
    },

    refreshShareTiles() {
        try {
            const self = this;
            this.shareIdentities().forEach(function (sid) {
                const t = self.tiles.get(sid);
                if (!t) return;
                self.paintShareTile(t, self.participantFor(self.baseIdentityOf(sid)));
            });
        } catch (e) {}
    },

    paintAll() {
        try {
            if (this.local) this.paintTile(this.local);
            if (this.room) this.room.remoteParticipants.forEach((p) => this.paintTile(p));
        } catch (e) {}
    },

    /* ============ GOOGLE-MEET-STYLE PRESENTATION LAYOUT (additive) ======
       "Participant + Camera + Screen" is ONE logical participant. The screen
       tile gets presentation priority; the presenter's camera tile is hidden
       from the grid (mirrored as a CSS PiP overlay only) so there is never a
       duplicate A-camera + A-screen pair. Pure DOM classes + CSS order —
       <video> elements are never re-parented, so LiveKit subscriptions stay
       intact. */
    baseIdentityOf(id) {
        return String(id || "").replace(/#screen$/, "");
    },

    isScreenId(id) {
        return String(id || "").indexOf("#screen") !== -1;
    },

    shareIdentities() {
        const out = [];
        try {
            this.tiles.forEach(function (t, id) {
                if (t && t.isConnected !== false
                    && String(id).indexOf("#screen") !== -1) out.push(String(id));
            });
        } catch (e) {}
        return out;
    },

    orderedShareIdentities() {
        const self = this;
        const live = {};
        this.shareIdentities().forEach(function (id) { live[id] = true; });
        /* Stable order: keep first-seen order, drop stopped shares. */
        this.presentOrder = (this.presentOrder || []).filter(function (id) { return live[id]; });
        this.shareIdentities().forEach(function (id) {
            if (self.presentOrder.indexOf(id) === -1) self.presentOrder.push(id);
        });
        const rank = function (id) {
            const base = self.baseIdentityOf(id);
            if (self.spotlightIdentity && base === self.spotlightIdentity) return 0;
            if (self.pinnedIdentity && base === self.pinnedIdentity) return 1;
            if (self.activeShareIdentity && id === self.activeShareIdentity) return 2;
            return 3;
        };
        return this.presentOrder.slice().sort(function (a, b) {
            const ra = rank(a), rb = rank(b);
            if (ra !== rb) return ra - rb;
            return self.presentOrder.indexOf(a) - self.presentOrder.indexOf(b);
        });
    },

    queueLayout() {
        /* Coalesce subscribe/unsubscribe/publish bursts into one pass. */
        try {
            if (this._layoutQueued) return;
            this._layoutQueued = true;
            const self = this;
            const run = function () {
                self._layoutQueued = false;
                try { self.applyMeetingLayout(); } catch (e) {}
            };
            if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
            else setTimeout(run, 0);
        } catch (e) {}
    },

    applyMeetingLayout() {
        const grid = document.getElementById("livekitGrid");
        if (!grid) return;
        const shares = this.orderedShareIdentities();
        const presenting = this.presentMode || shares.length > 0;
        grid.classList.toggle("is-presenting", presenting);
        grid.classList.toggle("has-pinned", !!this.pinnedIdentity);
        grid.classList.toggle("has-spotlight", !!this.spotlightIdentity);
        const self = this;
        const presenterBases = {};
        shares.forEach(function (sid, i) {
            presenterBases[self.baseIdentityOf(sid)] = true;
        });
        /* Count-aware share sizing: 1 dominant stage, 2 side-by-side, 3+
           stay readable (JS class, not fragile :has/:nth-of-type). */
        grid.classList.toggle("shares-1", shares.length === 1);
        grid.classList.toggle("shares-2", shares.length === 2);
        grid.classList.toggle("shares-many", shares.length >= 3);
        shares.forEach(function (sid, i) {
            const t = self.tiles.get(sid);
            if (!t) return;
            t.classList.add("is-share-main");
            t.classList.remove("is-compact", "is-presenter-cam");
            t.classList.toggle("is-active-share",
                !!(self.activeShareIdentity ? sid === self.activeShareIdentity : i === 0));
            try { t.style.order = String(i); } catch (e) {}
            self.syncPresenterPiP(t, self.baseIdentityOf(sid));
        });
        this.tiles.forEach(function (t, id) {
            if (!t || self.isScreenId(id)) return;
            const isPresenter = !!presenterBases[String(id)];
            t.classList.toggle("is-presenter-cam", presenting && isPresenter);
            t.classList.toggle("is-compact", presenting && !isPresenter);
            t.classList.remove("is-share-main", "is-active-share");
            try { t.style.order = String(900); } catch (e) {}
        });
        try {
            const empty = grid.querySelector(".lk-empty");
            if (empty && (shares.length > 0 || grid.querySelector(".lk-tile"))) empty.remove();
        } catch (e) {}
        this.syncPresentButtons();
    },

    /* ===== PRESENTER CAMERA PiP (real LiveKit camera video in the corner) ==
       The presentation tile (identity#screen) owns a small PiP that shows the
       PRESENTER'S OWN CAMERA publication — the same participant identity as
       the screen share, never a second participant and never someone else's
       camera. Media rules enforced here:
       - camera vs screen-share are distinguished by publication source
         (Track.Source.Camera vs Track.Source.ScreenShare) — never by "first
         video track found";
       - the camera <video> inside the camera tile is NEVER re-parented: the
         PiP gets its own element attached to the same track (multi-element
         attach is a supported LiveKit track operation);
       - camera OFF / muted / ended / unavailable => initials avatar fallback
         ("Connecting…" while enabled but not yet decoding). The PiP is never
         an empty bordered box;
       - every removal path releases ONLY the PiP element from the camera
         track (single-element detach), so the screen share and the camera
         tile keep playing untouched. */
    screenVideoOf(tile) {
        /* Direct-child guard: a nested PiP <video> must never be mistaken
           for the screen-share <video> by painters / attach / menus. */
        try { return tile.querySelector(":scope > video"); }
        catch (e) { return tile.querySelector("video"); }
    },

    cameraTrackFor(baseIdentity) {
        try {
            const p = this.participantFor(baseIdentity);
            if (!p) return null;
            const Lk = window.LivekitClient;
            if (!Lk || !Lk.Track || !Lk.Track.Source) return null;
            /* AUTHORITATIVE camera publication lookup (source-tagged). */
            const pub = p.getTrackPublication(Lk.Track.Source.Camera);
            if (!pub || !pub.track || pub.isMuted) return null;
            const mt = pub.track.mediaStreamTrack;
            if (mt && mt.readyState === "ended") return null;
            return pub.track;
        } catch (e) { return null; }
    },

    ensurePip(shareTile) {
        let pip = null;
        try { pip = shareTile.querySelector(":scope > .lk-pip"); }
        catch (e) { pip = shareTile.querySelector(".lk-pip"); }
        if (pip && pip.isConnected) return pip;
        if (pip) pip.remove();
        pip = document.createElement("div");
        pip.className = "lk-pip is-avatar";
        pip.dataset.pipFor = "";
        const video = document.createElement("video");
        video.className = "lk-pip-video";
        video.muted = true;                 /* presenter preview is silent */
        video.autoplay = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("aria-hidden", "true");
        const av = document.createElement("div");
        av.className = "lk-pip-avatar";
        const state = document.createElement("div");
        state.className = "lk-pip-state";
        const nm = document.createElement("div");
        nm.className = "lk-pip-name";
        pip.appendChild(video);
        pip.appendChild(av);
        pip.appendChild(state);
        pip.appendChild(nm);
        shareTile.appendChild(pip);
        return pip;
    },

    attachPipVideo(pip, track) {
        try {
            if (!pip || !track) return null;
            let v = pip.querySelector("video.lk-pip-video");
            if (!v) {
                v = document.createElement("video");
                v.className = "lk-pip-video";
                v.muted = true;
                v.autoplay = true;
                v.setAttribute("playsinline", "");
                v.setAttribute("aria-hidden", "true");
                pip.insertBefore(v, pip.firstChild);
            }
            if (v._lkTrack === track && v.dataset.lkAttached === "1") return v;
            /* A NEW camera publication (re-publish after the capture was
               stopped) must not leave the OLD track holding this element:
               release the stale reference before attaching the new track. */
            if (v._lkTrack && v._lkTrack !== track && typeof v._lkTrack.detach === "function") {
                try { v._lkTrack.detach(v); } catch (e) {}
            }
            if (typeof track.attach === "function") {
                /* Supported multi-element attach: the presenter's camera tile
                   keeps its own element; this one is a second render surface
                   for the same track. */
                try { track.attach(v); } catch (e) {
                    v.srcObject = track.mediaStream || track.mediaStreamTrack;
                }
            } else {
                v.srcObject = track.mediaStream || track.mediaStreamTrack;
            }
            v._lkTrack = track;
            try { v.dataset.lkAttached = "1"; } catch (e) {}
            try { v.playsInline = true; } catch (e) {}
            try {
                const pr = v.play();
                if (pr && pr.catch) pr.catch(function () {});
            } catch (e) {}
            return v;
        } catch (e) { return null; }
    },

    releasePipVideo(pip) {
        try {
            if (!pip) return;
            const v = pip.querySelector("video.lk-pip-video");
            if (!v) return;
            /* Detach exactly THIS element from the camera track — the
               presenter's camera tile element must keep playing. */
            try { if (v._lkTrack && typeof v._lkTrack.detach === "function") v._lkTrack.detach(v); } catch (e) {}
            try { v.pause(); } catch (e) {}
            try { v.srcObject = null; } catch (e) {}
            try { v.dataset.lkAttached = ""; } catch (e) {}
            try { delete v._lkTrack; } catch (e) { v._lkTrack = null; }
            v.remove();
        } catch (e) {}
    },

    watchPipVideo(pip, v, shareTile, baseIdentity) {
        try {
            if (!v || v.dataset.lkBound === "1") return;
            v.dataset.lkBound = "1";
            const self = this;
            let sawFrames = false;
            const reevaluate = function () {
                try {
                    const hasFrames = !!(v.videoWidth > 0 && v.videoHeight > 0);
                    if (hasFrames) {
                        sawFrames = true;
                        try { clearTimeout(v._pipProbe); } catch (e) {}
                    }
                    self.paintPresenterPiP(shareTile, pip, baseIdentity);
                } catch (e) {}
            };
            ["loadedmetadata", "loadeddata", "playing", "resize"].forEach(function (ev) {
                v.addEventListener(ev, function () {
                    try { v.dataset.lkDead = ""; } catch (e) {}
                    reevaluate();
                });
            });
            ["emptied", "error", "stalled"].forEach(function (ev) {
                v.addEventListener(ev, function () {
                    try { v.dataset.lkDead = "1"; } catch (e) {}
                    reevaluate();
                });
            });
            /* MEDIA VALIDATION: camera enabled but no decoded frames within
               2.5s => honest degraded state, never an empty video box. */
            v._pipProbe = setTimeout(function () {
                if (!sawFrames) { try { v.dataset.lkDead = "1"; } catch (e) {} }
                reevaluate();
            }, 2500);
        } catch (e) {}
    },

    /* Derives ONE visible state for the PiP (avatar / waiting / live) from
       the real camera track + the element's own decode state. */
    paintPresenterPiP(shareTile, pip, baseIdentity) {
        try {
            if (!pip || !pip.isConnected) return;
            /* Initials/name come from the presenter's REAL display name —
               never from the "X — Screen" label (which produced "SC"). */
            let name = "";
            try {
                const p = this.participantFor(baseIdentity);
                if (p) {
                    name = String(this.displayName(p, "") || "");
                    if (p.isLocal) name = name.replace(/\s*\(you\)\s*$/, "");
                }
            } catch (e) {}
            if (!name) {
                try {
                    const lbl = shareTile.querySelector(".lk-name");
                    if (lbl) {
                        name = (lbl.textContent || "")
                            .replace(/\s*—\s*Screen\s*$/, "")
                            .replace(/\s*\(you\)\s*$/, "");
                    }
                } catch (e) {}
            }
            name = String(name || "Presenter").trim() || "Presenter";
            const initials = (typeof initialsOf === "function") ? initialsOf(name) : "?";

            const av = pip.querySelector(".lk-pip-avatar");
            const state = pip.querySelector(".lk-pip-state");
            const nm = pip.querySelector(".lk-pip-name");
            const v = pip.querySelector("video.lk-pip-video");

            const camOn = !!this.cameraTrackFor(baseIdentity);
            const camLive = !!(camOn && v && v.srcObject
                && v.dataset.lkDead !== "1" && v.videoWidth > 0 && v.videoHeight > 0);

            if (av) av.textContent = initials;
            if (nm) {
                if (nm.textContent !== name) nm.textContent = name;
                nm.style.display = camLive ? "none" : "";
            }
            if (state) {
                let text = "";
                if (camOn && !camLive) text = (v && v.videoWidth > 0) ? "" : "Connecting\u2026";
                else if (!camOn) text = "Camera off";
                if (state.textContent !== text) state.textContent = text;
                state.style.display = text ? "" : "none";
            }
            pip.classList.toggle("is-live", camLive);
            pip.classList.toggle("is-waiting", !!camOn && !camLive);
            pip.classList.toggle("is-avatar", !camLive);
            pip.classList.toggle("is-degraded", !!camOn && !camLive);
            pip.title = name + (camLive ? " — camera on" : " — camera off");
        } catch (e) {}
    },

    /* Screen-share teardown (unpublish / unsubscribe / stop / leave):
       detach the PiP element from the camera track, then drop the overlay.
       The screen track and the presenter's camera tile are untouched. */
    clearPresenterPiP(shareTile) {
        try {
            if (!shareTile) return;
            let pip = null;
            try { pip = shareTile.querySelector(":scope > .lk-pip"); }
            catch (e) { pip = shareTile.querySelector(".lk-pip"); }
            if (!pip) return;
            this.releasePipVideo(pip);
            pip.remove();
        } catch (e) {}
    },

    refreshPresenterPiP(shareTile, baseIdentity) {
        try {
            if (!shareTile || !shareTile.isConnected) return;
            const pip = this.ensurePip(shareTile);
            const track = this.cameraTrackFor(baseIdentity);
            let v = track ? this.attachPipVideo(pip, track) : null;
            if (!track) {
                /* Camera off / unavailable / no usable frame: drop the video
                   element entirely and fall back to initials. */
                this.releasePipVideo(pip);
                v = null;
            } else if (v) {
                this.watchPipVideo(pip, v, shareTile, baseIdentity);
            }
            try { pip.dataset.pipFor = String(baseIdentity || ""); } catch (e) {}
            this.paintPresenterPiP(shareTile, pip, baseIdentity);
        } catch (e) {}
    },

    /* Existing public hook used by applyMeetingLayout / paintShareTile /
       paintTile — now renders the REAL camera video with avatar fallback. */
    syncPresenterPiP(shareTile, baseIdentity) {
        this.refreshPresenterPiP(shareTile, baseIdentity);
    },

    syncPresentButtons() {
        try {
            const presentBtn = document.getElementById("presentBtn");
            if (presentBtn) {
                presentBtn.classList.toggle("live", !!this.presentMode);
                presentBtn.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>' +
                    (this.presentMode ? "Presenting" : "Present") + "</span>";
            }
            const exitBtn = document.getElementById("exitPresentationBtn");
            if (exitBtn) exitBtn.hidden = !(this.presentMode || document.body.classList.contains("presenting"));
        } catch (e) {}
    },

    setPresentMode(on) {
        const want = !!on;
        if (want && !this.shareIdentities().length) {
            if (typeof showToast === "function") showToast("No screen share is active right now.", true);
            return false;
        }
        this.presentMode = want;
        document.body.classList.toggle("presenting", want);
        if (want && !this.activeShareIdentity) {
            try {
                const first = this.orderedShareIdentities()[0];
                if (first) this.activeShareIdentity = first;
            } catch (e) {}
        }
        try { this.applyMeetingLayout(); } catch (e) {}
        try { this.applyPresentationHighlight(); } catch (e) {}
        return want;
    },
};
