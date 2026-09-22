/* =====================================================================
   SKILLSHARE — RECRUITER JOBS / OPPORTUNITY MANAGER (Stage 2.7)
   Real data only. Single source: GET /api/opportunities/mine.

   API contract (window.SkillShareAPI / window.SkillShareAuth):
     requireUser()                   -> { id, role, name }  (auth guard)
     getMyRoleProfile()              -> { profile: { company_name, ... } }
     getMyOpportunities({ limit })   -> { opportunities: [...] }
     getOpportunity(id)              -> { opportunity: { ... } }
     createOpportunity(data)         -> { opportunity: { id, status } }
     updateOpportunity(id, data)     -> { opportunity: {...} }  (PATCH)
     replaceOpportunitySkills(id, s)-> { skills: s }           (PUT)
     publishOpportunity(id)          -> { opportunity: {...} }
     closeOpportunity(id)            -> { opportunity: {...} }
     deleteOpportunity(id)           -> { ok: true }
     searchSkillCatalog(q, lim)      -> { skills: [{ id, name, category }] }

   Rules:
     * status filters operate on REAL backend status (client-side)
     * lifecycle changes only via publish/close endpoints (never PATCH status)
     * ownership is server-side (JWT); UI never sends owner/company ids
     * no mock rows, no fabricated fields, no application counts
   ===================================================================== */
(function () {
"use strict";

var API = window.SkillShareAPI;
var AUTH = window.SkillShareAuth;

var TYPE_LABELS = {
  internship: "Internship", job: "Full-time", placement: "Placement",
  apprenticeship: "Apprenticeship", mini_project: "Mini project", part_time: "Part-time"
};
var MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/* ---------------- app state ---------------- */
var S = {
  user: null, role: "", company: "", companyLocation: "",
  rows: [], loaded: false,
  status: "", type: "", mode: "", q: "",
  editing: null,              /* { id, detail } | null */
  skills: [],                 /* skills in the open composer */
  skillSearchTimer: null,
  confirmResolve: null,
  confirmPrev: null,
  /* STAGE 9.3 — recruiter applicant review (additive). Rows keep the exact
     _serialize_applicant shape the backend returns: { application, opportunity,
     student }. No mock rows, no fabricated fields, no applicant counts. */
  applicants: {
    oppId: null, rows: [], total: 0, offset: 0, has_more: false,
    status: "", q: "", loading: false, loaded: false, searchTimer: null
  },
  review: { item: null, busy: false }
};
window.__jobs = window.__jobs || {};
window.__jobs.state = S;

/* ---------------- tiny helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clean(v) { return v == null ? "" : String(v).trim(); }
function show(el, on) { if (el) el.hidden = !on; }
function toast(m) { if (window.portalToast) window.portalToast(m); }
/* Error message routing: 401/403/404/409/422 get specific friendly copy;
   server-authored detail (409/422) is surfaced verbatim when it looks like
   a human sentence (no JSON/HTML/SQL/traceback). */
function readableDetail(e) {
  var d = clean(e && (e.detail || e.message));
  if (!d || d.length > 180) return "";
  if (/[{}<>]/.test(d)) return "";
  if (/traceback|sqlalchemy|select |insert |stack/i.test(d)) return "";
  if (!/\s/.test(d)) return "";
  return d;
}
function msgFor(e) {
  var st = e && e.status;
  if (st === 401) return "Your session has expired. Please sign in again.";
  if (st === 403) return "You don't have permission to manage this opportunity.";
  if (st === 404) return "Opportunity not found.";
  if (st === 409) return readableDetail(e) || "Unable to complete this action — the opportunity state has changed.";
  if (st === 422) return readableDetail(e) || "Please check the opportunity information.";
  if (st === 0 || (st && st >= 500)) return "Something went wrong. Please try again.";
  return readableDetail(e) || (e && e.message) || "Something went wrong.";
}
function actionToast(e, fallback) {
  var st = e && e.status;
  if (st === 409 || st === 422) return readableDetail(e) || fallback || msgFor(e);
  return msgFor(e);
}
function typeLabel(t) {
  return TYPE_LABELS[clean(t).toLowerCase()] || "--";
}
function modeLabel(m) {
  return MODE_LABELS[clean(m).toLowerCase()] || "--";
}
function statusBadge(st) {
  st = clean(st).toLowerCase();
  if (st === "published") return '<span class="badge green">Published</span>';
  if (st === "closed") return '<span class="badge grey">Closed</span>';
  if (st === "archived") return '<span class="badge grey">Archived</span>';
  return '<span class="badge amber">Draft</span>';
}
function fmtDate(iso) {
  if (!iso) return "--";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  try { return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch (ex) { return String(iso).slice(0, 10); }
}
function rowSkills(r) {
  var arr = (r && (r.skills || r.required_skills)) || [];
  return arr.map(function (s) { return clean(s.skill_name || s.name); }).filter(Boolean);
}

/* ---------------- client-side filtering ---------------- */
function rowText(r) {
  return [
    r.title, r.company_name, r.location,
    clean(r.opportunity_type), typeLabel(r.opportunity_type),
    clean(r.work_mode), modeLabel(r.work_mode), clean(r.status)
  ].concat(rowSkills(r)).map(function (v) { return clean(v).toLowerCase(); }).join(" ");
}
function visibleRows() {
  return S.rows.filter(function (r) {
    if (S.status && clean(r.status).toLowerCase() !== S.status) return false;
    if (S.type && clean(r.opportunity_type).toLowerCase() !== S.type) return false;
    if (S.mode && clean(r.work_mode).toLowerCase() !== S.mode) return false;
    if (S.q && rowText(r).indexOf(S.q.toLowerCase()) === -1) return false;
    return true;
  });
}

/* ---------------- card rendering ---------------- */
function cardHtml(r) {
  var id = Number(r.id);
  var st = clean(r.status).toLowerCase();
  var names = rowSkills(r);
  var skillsEl = names.length
    ? names.slice(0, 4).map(function (n) { return '<span class="tag">' + esc(n) + "</span>"; }).join("") +
      (names.length > 4 ? '<span class="muted">+' + (names.length - 4) + " more</span>" : "")
    : '<span class="muted">No required skills yet</span>';
  var actions = '<a class="btn small ghost" href="opportunity-details.html?id=' + id + '">View</a>';
  /* STAGE 9.3 — every non-draft row exposes the real applicant list
     (published/closed/archived all keep their applications). Drafts can
     never receive applications, so no Applicants entry there. */
  if (st !== "draft") {
    actions += '<button class="btn small primary" data-act="applicants" data-id="' + id + '" type="button">Applicants</button>';
  }
  if (st === "draft") {
    actions += '<button class="btn small" data-act="edit" data-id="' + id + '" type="button">Edit</button>' +
      '<button class="btn small primary" data-act="publish" data-id="' + id + '" type="button">Publish</button>' +
      '<button class="btn small danger" data-act="delete" data-id="' + id + '" type="button">Delete</button>';
  } else if (st === "published") {
    actions += '<button class="btn small" data-act="edit" data-id="' + id + '" type="button">Edit</button>' +
      '<button class="btn small danger" data-act="close" data-id="' + id + '" type="button">Close</button>' +
      '<button class="btn small ghost" data-act="archive" data-id="' + id + '" type="button">Archive</button>';
  } else if (st === "closed") {
    actions += '<button class="btn small ghost" data-act="archive" data-id="' + id + '" type="button">Archive</button>';
  }
  return '<article class="jobs-card" data-id="' + id + '">' +
    '<div class="jobs-card-head"><div class="grow"><h3>' + esc(r.title || "Untitled role") + "</h3>" +
    '<p class="muted">' + esc(r.company_name || S.company || "Company not set") + " · " +
    esc(typeLabel(r.opportunity_type)) + " · " + esc(modeLabel(r.work_mode)) + "</p></div>" +
    statusBadge(st) + "</div>" +
    '<div class="jobs-card-meta">' +
      '<span><b>Deadline</b><span>' + esc(fmtDate(r.deadline)) + "</span></span>" +
      '<span><b>Openings</b><span>' + esc(r.openings == null ? "--" : r.openings) + "</span></span>" +
    "</div>" +
    '<div class="jobs-card-skills"><span class="jobs-skills-label">Required skills</span>' + skillsEl + "</div>" +
        '<div class="jobs-card-actions">' + actions + "</div></article>";
}

/* ---------------- list state + render ---------------- */
function showState(which) {
  show($("jobsLoading"), which === "loading");
  show($("jobsRows"), which === "list");
  show($("jobsEmpty"), which === "empty");
  show($("jobsFilterEmpty"), which === "filter");
  show($("jobsError"), which === "error");
}
function setCount(shown) {
  var total = S.rows.length, el = $("jobsCount");
  if (!el) return;
  if (!total) { el.textContent = ""; return; }
  el.textContent = (S.status || S.type || S.mode || S.q)
    ? shown + " of " + total + " shown"
    : total + (total === 1 ? " opportunity" : " opportunities");
}
function renderList() {
  var rows = visibleRows();
  setCount(rows.length);
  if (!S.rows.length) { showState("empty"); return; }
  if (!rows.length) { showState("filter"); return; }
  $("jobsRows").innerHTML = rows.map(cardHtml).join("");
  showState("list");
}
function showListError(m) {
  showState("error");
  var el = $("jobsErrorMsg");
  if (el) el.textContent = m || "Something went wrong. Please try again.";
}

/* ---------------- data loading ---------------- */
function loadProfile() {
  return API.getMyRoleProfile().then(function (data) {
    var p = (data && data.profile) || data || {};
    S.company = clean(p.company_name);
    S.companyLocation = clean(p.company_location);
    if (S.company) {
      var cn = $("jobsCompanyName"); if (cn) cn.textContent = S.company;
      var sub = $("jobsCompanySub"); if (sub) sub.textContent = S.companyLocation ? "· " + S.companyLocation : "";
      show($("jobsCompanyBanner"), true);
      show($("jobsProfileWarn"), false);
    }
  }).catch(function () {
    show($("jobsProfileWarn"), false);
  });
}
function loadList() {
  showState("loading");
  return API.getMyOpportunities({ limit: 100 }).then(function (data) {
    S.rows = (data && (data.opportunities || data.items)) || [];
    S.loaded = true;
    renderList();
  }).catch(function (e) {
    S.loaded = false;
    S.rows = [];
        showListError(msgFor(e));
  });
}

/* ---------------- confirm dialog ---------------- */
function askConfirm(opts) {
  opts = opts || {};
  var el = $("jobsConfirm");
  if (!el) return Promise.resolve(false);
  $("jobsConfirmTitle").textContent = opts.title || "Are you sure?";
  $("jobsConfirmMsg").textContent = opts.message || "—";
  var ok = $("jobsConfirmOk");
  ok.textContent = opts.okLabel || "Confirm";
  ok.className = "btn small" + (opts.danger ? " danger" : "");
  show(el, true);
  try { $("jobsConfirmCancel").focus(); } catch (e) {}
  S.confirmPrev = document.activeElement;
  return new Promise(function (resolve) { S.confirmResolve = resolve; });
}
function settleConfirm(result) {
  show($("jobsConfirm"), false);
  var r = S.confirmResolve;
  S.confirmResolve = null;
  if (typeof r === "function") r(result);
  try { if (S.confirmPrev && S.confirmPrev.focus) S.confirmPrev.focus(); } catch (e) {}
  S.confirmPrev = null;
}
function confirmOpen() { return !!S.confirmResolve; }

/* ---------------- skill editor helpers ---------------- */
function skillPayload() {
  return S.skills.map(function (s) {
    return {
      skill_id: Number(s.skill_id),
      required_level: clean(s.required_level) || "intermediate",
      importance: clean(s.importance) || "medium",
      skill_type: clean(s.skill_type) || "required"
    };
  });
}
function renderSelected() {
  var host = $("jobsSkillSelected");
  if (!host) return;
  var LEVELS = ["beginner", "intermediate", "advanced", "expert"];
  var IMPORTANCE = ["critical", "high", "medium", "low"];
  var SKILL_TYPES = ["required", "preferred"];
  function opts(list, cur) {
    cur = clean(cur) || list[1];
    return list.map(function (v) {
      return "<option value='" + v + "'" + (v === cur ? " selected" : "") + ">" +
        v.charAt(0).toUpperCase() + v.slice(1) + "</option>";
    }).join("");
  }
  show($("jobsSkillEmpty"), !S.skills.length);
  host.innerHTML = S.skills.map(function (s, i) {
    return "<div class='jobs-skill-row' data-i='" + i + "'>" +
      "<div class='grow'><b>" + esc(s.skill_name) + "</b></div>" +
      "<select data-k='required_level' aria-label='Required level'>" + opts(LEVELS, s.required_level) + "</select>" +
      "<select data-k='importance' aria-label='Importance'>" + opts(IMPORTANCE, s.importance) + "</select>" +
      "<select data-k='skill_type' aria-label='Skill type'>" + opts(SKILL_TYPES, s.skill_type) + "</select>" +
      "<button class='btn small ghost' data-rm='" + i + "' type='button' aria-label='Remove'>" + esc(s.skill_name) + "</button>" +
      "</div>";
  }).join("");
  var hint = $("jobsSkillHint");
  if (hint) hint.textContent = S.skills.length
    ? S.skills.length + " selected"
    : "At least one skill is required to publish.";
}
function searchSkills(q) {
  q = clean(q);
  var box = $("jobsSkillResults");
  if (!box) return Promise.resolve();
  if (!q) { box.innerHTML = ""; return Promise.resolve(); }
  box.innerHTML = "<div class='jobs-search-item'><span class='muted'>Searching...</span></div>";
  return API.searchSkillCatalog(q, 8).then(function (data) {
    var list = (data && data.skills) || [];
    if (!list.length) {
      box.innerHTML = "<div class='jobs-search-item'><span class='muted'>No matching skills.</span></div>";
      return;
    }
    box.innerHTML = list.map(function (s) {
      var dup = S.skills.some(function (x) { return Number(x.skill_id) === Number(s.id); });
      return "<div class='jobs-search-item'><div class='grow'><b>" + esc(s.name) + "</b> <small>" + esc(s.category || "") + "</small></div>" +
        (dup ? "<span class='muted'>Added</span>"
             : "<button class='btn small' data-add='" + Number(s.id) + "' data-name=\"" + esc(s.name) + "\" type='button'>Add</button>") +
        "</div>";
    }).join("");
  }).catch(function (e) {
    box.innerHTML = "<div class='jobs-search-item'><span class='muted'>" + esc(msgFor(e)) + "</span></div>";
  });
}


/* ---------------- form helpers ---------------- */
function collectForm() {
  return {
    title: clean($("f_title").value),
    description: clean($("f_description").value),
    opportunity_type: clean($("f_opportunity_type").value).toLowerCase(),
    work_mode: clean($("f_work_mode").value).toLowerCase(),
    location: clean($("f_location").value),
    duration: clean($("f_duration").value),
    compensation: clean($("f_compensation").value),
    openings: $("f_openings").value ? Number($("f_openings").value) : null,
    deadline: clean($("f_deadline").value),
    start_date: clean($("f_start_date").value),
    min_cgpa: $("f_min_cgpa").value ? Number($("f_min_cgpa").value) : null,
    responsibilities: clean($("f_responsibilities").value),
    eligibility_text: clean($("f_eligibility_text").value),
    eligible_degree: clean($("f_eligible_degree").value),
    eligible_branch: clean($("f_eligible_branch").value)
  };
}
function formErrors(d) {
  var es = [];
  if (!d.title) es.push("Title is required.");
  if (!d.opportunity_type) es.push("Opportunity type is required.");
  if (!d.deadline) es.push("Application deadline is required.");
  if (d.deadline && isNaN(new Date(d.deadline).getTime())) es.push("Deadline must be a valid date.");
  if (d.start_date && d.deadline && new Date(d.deadline) < new Date(d.start_date))
    es.push("The application deadline cannot be before the start date.");
  if (d.deadline && new Date(d.deadline) < new Date())
    es.push("The application deadline is already in the past.");
  return es;
}
function showFormError(m) {
  show($("jobsFormError"), true);
  var el = $("jobsFormErrorMsg"); if (el) el.textContent = m;
}
function clearFormError() {
  show($("jobsFormError"), false);
  var el = $("jobsFormErrorMsg"); if (el) el.textContent = "";
}

/* ---------------- composer lifecycle ---------------- */
function openComposer(raw) {
  var detail = raw ? (raw.opportunity || raw) : null;
  clearFormError();
  setComposerLocked(false);  /* every fresh open starts unlocked */
  if (detail) {
    S.editing = { id: Number(detail.id), detail: detail };
    $("jobsModalTitle").textContent = "Edit opportunity";
    $("jobsEditingLine").hidden = false;
    $("jobsEditingId").textContent = detail.id;
    $("jobsEditingStatus").textContent = clean(detail.status);
    $("f_title").value = detail.title || "";
    $("f_description").value = detail.description || "";
    $("f_opportunity_type").value = clean(detail.opportunity_type);
    $("f_work_mode").value = clean(detail.work_mode);
    $("f_location").value = detail.location || "";
    $("f_duration").value = detail.duration || "";
    $("f_compensation").value = detail.compensation || "";
    $("f_openings").value = detail.openings != null ? detail.openings : "";
    $("f_deadline").value = clean(detail.deadline).slice(0, 10);
    $("f_start_date").value = clean(detail.start_date).slice(0, 10);
    $("f_min_cgpa").value = detail.min_cgpa != null ? detail.min_cgpa : "";
    $("f_responsibilities").value = detail.responsibilities || "";
    $("f_eligibility_text").value = detail.eligibility_text || "";
    $("f_eligible_degree").value = detail.eligible_degree || "";
    $("f_eligible_branch").value = detail.eligible_branch || "";
    /* load skills from the detail (real catalog ids preserved) */
    S.skills = (detail.skills || detail.required_skills || []).map(function (s) {
      return { skill_id: Number(s.skill_id || s.id), skill_name: s.skill_name || s.name, required_level: s.required_level, importance: s.importance, skill_type: s.skill_type };
    });
        var st = clean(detail.status).toLowerCase();
    $("jobsSaveDraftBtn").hidden = true;
    $("jobsSaveChangesBtn").hidden = false;
    $("jobsCloseBtn").hidden = st !== "published";  /* close available for published */
    var pub = $("jobsPublishBtn");
    pub.textContent = st === "published" ? "Published" : "Publish";
    pub.disabled = st === "published";
  } else {
    S.editing = null;
    $("jobsModalTitle").textContent = "Post job";
    $("jobsEditingLine").hidden = true;
    $("jobsEditingId").textContent = "";
    $("jobsEditingStatus").textContent = "";
    $("f_title").value = "";
    $("f_description").value = "";
    $("f_opportunity_type").value = "";
    $("f_work_mode").value = "";
    $("f_location").value = "";
    $("f_duration").value = "";
    $("f_compensation").value = "";
    $("f_openings").value = "";
    $("f_deadline").value = "";
    $("f_start_date").value = "";
    $("f_min_cgpa").value = "";
    $("f_responsibilities").value = "";
    $("f_eligibility_text").value = "";
    $("f_eligible_degree").value = "";
    $("f_eligible_branch").value = "";
    S.skills = [];
    $("jobsSaveDraftBtn").hidden = false;
    $("jobsSaveChangesBtn").hidden = true;
    $("jobsCloseBtn").hidden = true;
    $("jobsPublishBtn").textContent = "Save & Publish";
    $("jobsPublishBtn").disabled = false;
  }
  renderSelected();
  show($("jobsModal"), true);
  $("f_title").focus();
}
function closeComposer() {
  S.editing = null; S.skills = [];
  clearFormError();
  show($("jobsModal"), false);
  if (confirmOpen()) settleConfirm(false);
  var box = $("jobsSkillResults"); if (box) box.innerHTML = "";
  var q = $("jobsSkillSearch"); if (q) q.value = "";
}

/* ---------------- card-level actions (draft/published/closed) ---------------- */
function cardPublish(id) {
  return askConfirm({
    title: "Publish opportunity?",
    message: "Publish this opportunity? It becomes visible to students.",
    okLabel: "Publish"
  }).then(function (ok) {
    if (!ok) return;
    return API.publishOpportunity(id).then(function () {
      S.rows = S.rows.map(function (r) {
        if (Number(r.id) === id) r = Object.assign({}, r, { status: "published" });
        return r;
      });
      renderList();
      toast("Opportunity published.");
    }).catch(function (e) {
      toast(actionToast(e, "Could not publish this opportunity."));
      loadList();  /* resync after failure */
    });
  });
}
function cardClose(id) {
  return askConfirm({
    title: "Close opportunity?",
    message: "Close this opportunity? Students will no longer see it as an active opportunity.",
    okLabel: "Close"
  }).then(function (ok) {
    if (!ok) return;
    return API.closeOpportunity(id).then(function () {
      S.rows = S.rows.map(function (r) {
        if (Number(r.id) === id) r = Object.assign({}, r, { status: "closed" });
        return r;
      });
      renderList();
      toast("Opportunity closed.");
    }).catch(function (e) {
      toast(actionToast(e, "Could not close this opportunity."));
      loadList();
    });
  });
}
function cardArchive(id) {
  return askConfirm({
    title: "Archive opportunity?",
    message: "Archive this opportunity? It leaves public discovery and can no longer receive applications. Existing applications are kept.",
    okLabel: "Archive"
  }).then(function (ok) {
    if (!ok) return;
    return API.archiveOpportunity(id).then(function () {
      S.rows = S.rows.map(function (r) {
        if (Number(r.id) === id) r = Object.assign({}, r, { status: "archived" });
        return r;
      });
      renderList();
      toast("Opportunity archived.");
    }).catch(function (e) {
      toast(actionToast(e, "Could not archive this opportunity."));
      loadList();  /* resync after 409 */
    });
  });
}
function cardDelete(id) {
  return askConfirm({
    title: "Delete opportunity?",
    message: "Delete this draft opportunity?",
    okLabel: "Delete", danger: true
  }).then(function (ok) {
    if (!ok) return;
    return API.deleteOpportunity(id).then(function () {
      S.rows = S.rows.filter(function (r) { return Number(r.id) !== id; });
      renderList();
      toast("Draft deleted.");
    }).catch(function (e) {
      if (e && e.message !== "cancelled") toast(actionToast(e, "Could not delete this opportunity."));
      loadList();  /* resync after 409 */
    });
  });
}

/* ---------------- composer actions ---------------- */
function saveDraft() {
  var d = collectForm();
  clearFormError();
  /* Drafts save fast: only the title is required. The type/date rules only
     gate publishing, so a recruiter can keep a half-finished draft. */
  if (!d.title) { showFormError("Title is required."); return Promise.reject(new Error("blocked")); }
  var isNew = !S.editing;
  var p;
  if (S.editing) {
    p = API.updateOpportunity(S.editing.id, d);
  } else {
    p = API.createOpportunity(d).then(function (created) {
      var opp = created && (created.opportunity || created);
      S.editing = { id: Number(opp.id), detail: opp };
      return created;
    });
  }
  return p.then(function () {
    if (S.skills.length) return API.replaceOpportunitySkills(S.editing.id, skillPayload());
  }).then(function () {
    toast(isNew ? "Draft saved." : "Opportunity saved.");
    loadList();
    closeComposer();
  }).catch(function (e) {
    if (e && e.message === "blocked") return;
    if (S.editing) { showFormError(actionToast(e, "Failed to save changes.")); }
    else { showFormError(actionToast(e, "Failed to save draft.")); }
  });
}
function publishComposer() {
  var btn = $("jobsPublishBtn");
  if (btn && btn.disabled) return Promise.resolve();  /* inert for already-published rows */
  var d = collectForm();
  /* Order mirrors the test-visible validation chain:
     title -> skills -> date consistency -> past deadline. A single first
     failure is shown so the recruiter always sees a local explanation. */
  if (!d.title) { showFormError("Title is required."); return Promise.reject(new Error("blocked")); }
  if (S.skills.length < 1) {
    showFormError("Add at least one required skill before publishing.");
    return Promise.reject(new Error("blocked"));
  }
  if (d.start_date && d.deadline && new Date(d.deadline) < new Date(d.start_date)) {
    showFormError("The application deadline cannot be before the start date.");
    return Promise.reject(new Error("blocked"));
  }
  if (d.deadline && new Date(d.deadline) < new Date()) {
    showFormError("The application deadline is already in the past.");
    return Promise.reject(new Error("blocked"));
  }
  if (!S.editing) {
    /* create -> skills -> publish */
    return API.createOpportunity(d).then(function (created) {
      var opp = created && (created.opportunity || created);
      S.editing = { id: Number(opp.id), detail: opp };
      return API.replaceOpportunitySkills(S.editing.id, skillPayload());
    }).then(function () {
      return API.publishOpportunity(S.editing.id);
    }).then(function () {
      toast("Opportunity published.");
      loadList();
      closeComposer();
    }).catch(function (e) {
      if (e && e.message === "blocked") return;
      toast(actionToast(e, "Could not publish this opportunity."));
      loadList();
    });
  } else {
    /* editing a draft: save changes + confirm + publish */
    return saveDraft().then(function () {
      return askConfirm({
        title: "Publish opportunity?",
        message: "Publish this opportunity? It becomes visible to students.",
        okLabel: "Publish"
      });
    }).then(function (ok) {
      if (!ok) return;
      return API.publishOpportunity(S.editing.id).then(function () {
        S.rows = S.rows.map(function (r) {
          if (Number(r.id) === S.editing.id) r = Object.assign({}, r, { status: "published" });
          return r;
        });
        renderList();
        toast("Opportunity published.");
        closeComposer();
      }).catch(function (e) {
        if (e && e.message === "blocked") return;
        toast(actionToast(e, "Could not publish this opportunity."));
        loadList();
      });
    });
  }
}

/* Buttons that mutate server state. After a failed detail load they stay
   disabled so a half-loaded composer can never send a blind PATCH or PUT. */
function setComposerLocked(locked) {
  ["jobsSaveDraftBtn", "jobsSaveChangesBtn", "jobsPublishBtn", "jobsCloseBtn"].forEach(function (id) {
    var b = $(id); if (b) b.disabled = !!locked;
  });
}

/* Edit flow: open the composer shell first, then fetch the real detail.
   Success prefills via openComposer(); failure keeps the composer open,
   explains the failure in the form, and locks every mutating action. */
function openComposerForEdit(id) {
  openComposer(null);
  $("jobsModalTitle").textContent = "Edit opportunity";
  $("jobsSaveDraftBtn").hidden = true;
  $("jobsSaveChangesBtn").hidden = false;
  $("jobsCloseBtn").hidden = true;  /* status unknown until the detail loads */
  $("jobsPublishBtn").textContent = "Publish";
  setComposerLocked(true);
  API.getOpportunity(id).then(function (res) {
    openComposer(res.opportunity || res);
  }).catch(function (e) {
    S.editing = null;   /* no detail -> nothing here may PATCH or PUT skills */
    S.skills = [];
    renderSelected();
    showFormError(msgFor(e));
    setComposerLocked(true);
    show($("jobsModal"), true);  /* stay open so the recruiter sees the problem */
  });
}

/* ================================================================
   STAGE 9.3 — RECRUITER APPLICANT REVIEW (additive)
   Real data only: GET /api/opportunities/{id}/applications and
   PATCH /api/applications/{id}/status. The server stays authoritative:
   this code only mirrors the central APPLICATION_STATUS_TRANSITIONS map
   for control enablement, never recomputes eligibility, never invents
   applicant data, and always renders the server's response as truth
   after a mutation.
   ================================================================ */
var APP_TRANSITIONS = {
  applied: ["reviewing", "rejected"],
  reviewing: ["shortlisted", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["selected", "rejected"],
  selected: [],
  rejected: [],
  withdrawn: []
};
var APP_STATUS_META = {
  applied: { label: "Applied", badge: "blue" },
  reviewing: { label: "Reviewing", badge: "blue" },
  shortlisted: { label: "Shortlisted", badge: "purple" },
  interview: { label: "Interview", badge: "amber" },
  selected: { label: "Selected", badge: "green" },
  rejected: { label: "Rejected", badge: "red" },
  withdrawn: { label: "Withdrawn", badge: "grey" }
};
var APP_PAGE_LIMIT = 20;   /* backend clamps 1..100; list paginate via has_more */

function appMeta(st) {
  st = clean(st).toLowerCase();
  return APP_STATUS_META[st] ||
    { label: st ? st.charAt(0).toUpperCase() + st.slice(1) : "Unknown", badge: "grey" };
}
function appTargets(st) {
  return APP_TRANSITIONS[clean(st).toLowerCase()] || [];
}
function appBadge(st) {
  var m = appMeta(st);
  return '<span class="badge ' + m.badge + '">' + esc(m.label) + "</span>";
}
function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function appFind(id) {
  for (var i = 0; i < S.applicants.rows.length; i++) {
    var a = S.applicants.rows[i] && S.applicants.rows[i].application;
    if (a && Number(a.id) === id) return S.applicants.rows[i];
  }
  return null;
}

/* ---------------- applicant list ---------------- */
function appListState(which) {
  show($("appListLoading"), which === "loading");
  show($("appListEmpty"), which === "empty");
  show($("appFilterEmpty"), which === "filter");
  show($("appListError"), which === "error");
  show($("appList"), which === "list");
  show($("appLoadMoreWrap"), which === "list" && S.applicants.has_more);
}
function openApplicants(opp) {
  S.applicants.oppId = Number(opp.id);
  var t = $("appOppTitle");
  if (t) t.textContent = opp.title || "Untitled role";
  S.applicants.rows = [];
  S.applicants.total = 0;
  S.applicants.offset = 0;
  S.applicants.has_more = false;
  S.applicants.status = "";
  S.applicants.q = "";
  S.applicants.loaded = false;
  var sel = $("appStatusFilter");
  if (sel) sel.value = "";
  var box = $("appSearch");
  if (box) box.value = "";
  show($("applicantsPanel"), true);
  show($("appToolbar"), true);
  try { $("applicantsPanel").scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (e) {}
  loadApplicants(0);
}
function closeApplicants() {
  S.applicants.oppId = null;
  S.applicants.rows = [];
  show($("applicantsPanel"), false);
  var m = $("appReview");
  if (m && !m.hidden) closeReview();
}
function applicantRow(it) {
  var a = (it && it.application) || {};
  var stu = (it && it.student) || null;
  var prof = (stu && stu.profile) || {};
  var name = clean(stu && stu.name) || (a.id != null ? "Applicant #" + a.id : "Applicant");
  var bits = [];
  var edu = [clean(prof.degree), clean(prof.branch)].filter(Boolean).join(" · ");
  if (edu) bits.push(edu);
  if (clean(prof.college)) bits.push(clean(prof.college));
  if (a.applied_at) bits.push("applied " + fmtDate(a.applied_at));
  if (clean(a.status) === "rejected" && clean(a.rejection_reason)) {
    bits.push("reason: " + truncate(clean(a.rejection_reason), 60));
  }
  return '<article class="jobs-applicant" data-app-id="' + clean(a.id) + '">' +
    '<div class="grow"><h3>' + esc(name) + "</h3>" +
    (bits.length ? "<p>" + esc(bits.join(" · ")) + "</p>" : "") +
    "</div>" + appBadge(a.status) +
    '<button class="btn small ghost" data-app-review="' + clean(a.id) + '" type="button">Review</button>' +
    "</article>";
}
function renderApplicants() {
  var host = $("appList");
  if (host) host.innerHTML = S.applicants.rows.map(applicantRow).join("");
}
function loadApplicants(offset) {
  if (!S.applicants.oppId || !API || typeof API.getOpportunityApplications !== "function") {
    return Promise.resolve();
  }
  if (S.applicants.loading) return Promise.resolve();
  var fresh = !offset;
  S.applicants.loading = true;
  if (fresh) {
    S.applicants.rows = [];
    S.applicants.offset = 0;
    appListState("loading");
  }
  var params = { limit: APP_PAGE_LIMIT, offset: offset || 0 };
  if (S.applicants.status) params.status = S.applicants.status;
  if (S.applicants.q) params.search = S.applicants.q;
  return API.getOpportunityApplications(S.applicants.oppId, params).then(function (data) {
    var items = (data && data.items) || [];
    S.applicants.rows = fresh ? items : S.applicants.rows.concat(items);
    S.applicants.total = (data && data.total) || 0;
    S.applicants.has_more = Boolean(data && data.has_more);
    S.applicants.offset = (offset || 0) + items.length;
    S.applicants.loading = false;
    S.applicants.loaded = true;
    if (!S.applicants.rows.length) {
      appListState(fresh ? (S.applicants.status || S.applicants.q ? "filter" : "empty") : "list");
    } else {
      appListState("list");
    }
    renderApplicants();
  }).catch(function (e) {
    S.applicants.loading = false;
    if (fresh) {
      appListState("error");
      var em = $("appListErrorMsg");
      if (em) em.textContent = msgFor(e) || "Something went wrong. Please try again.";
    } else {
      toast(actionToast(e, "Could not load more applicants."));
    }
  });
}

/* ---------------- applicant review modal ---------------- */
function setFact(id, value) {
  var el = $(id);
  if (!el) return;
  if (value == null || clean(value) === "") { el.hidden = true; return; }
  var p = el.querySelector("p");
  if (p) p.textContent = String(value);
  el.hidden = false;
}
function setReviewMsg(text) {
  var el = $("appReviewMsg");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}
function updateNoteCount() {
  var ta = $("appNoteInput"), c = $("appNoteCount");
  if (ta && c) c.textContent = String((ta.value || "").length);
}
/* Renders ONLY fields the existing API actually provides. Absent fields
   stay hidden — no fake values, no raw JSON dump. */
function openReview(item) {
  var a = (item && item.application) || {};
  var stu = (item && item.student) || null;
  var prof = (stu && stu.profile) || {};
  var snap = (a.snapshot && typeof a.snapshot === "object") ? a.snapshot : null;
  var elig = (snap && snap.eligibility) || {};
  S.review.item = item;
  S.review.busy = false;
  var title = $("appReviewTitle");
  if (title) title.textContent = "Applicant review — " + (clean(stu && stu.name) || "Applicant");
  /* applicant + current profile (server serializer fields only) */
  setFact("appFactName", clean(stu && stu.name) || (a.id != null ? "Applicant #" + a.id : null));
  setFact("appFactPublicId", stu && stu.public_id);
  setFact("appFactCollege", prof.college);
  var edu = [clean(prof.degree), clean(prof.branch),
    prof.graduation_year != null ? "Class of " + prof.graduation_year : ""]
    .filter(Boolean).join(" · ");
  setFact("appFactEdu", edu);
  setFact("appFactCgpa", (prof.cgpa != null && prof.cgpa !== "") ? prof.cgpa + " / 10" : null);
  setFact("appFactRole", prof.target_job_role);
  setFact("appFactIndustry", prof.preferred_industry);
  var skills = (prof.top_skills || []).filter(function (s) { return clean(s); });
  var tags = $("appFactSkills") ? $("appFactSkills").querySelector(".app-skill-tags") : null;
  if (tags) {
    tags.innerHTML = skills.map(function (s) {
      return '<span class="tag">' + esc(s) + "</span>";
    }).join("");
  }
  if ($("appFactSkills")) $("appFactSkills").hidden = !skills.length;
  /* application facts */
  setFact("appFactApplied", a.applied_at ? fmtDate(a.applied_at) : null);
  setFact("appFactUpdated", a.status_changed_at ? "Status changed " + fmtDate(a.status_changed_at) : null);
  setFact("appFactCover", a.cover_note);
  setFact("appFactNote", a.recruiter_note);
  setFact("appFactReject", a.rejection_reason);
  /* apply-time snapshot: historical evidence, never regenerated */
  var hasSnap = Boolean(snap && (snap.captured_at || elig.eligible != null ||
    elig.match_percentage != null || elig.missing_skills));
  show($("appSnapEmpty"), !hasSnap);
  show($("appSnapWrap"), hasSnap);
  if (hasSnap) {
    var verdict = elig.eligible === true ? "Met all published requirements"
      : elig.eligible === false ? "Did not meet every requirement" : null;
    var when = snap.captured_at ? fmtDate(snap.captured_at) : "";
    setFact("appSnapApplied", verdict ? verdict + (when ? " (" + when + ")" : "") : null);
    var pct = elig.match_percentage;
    setFact("appSnapMatch", (pct != null && isFinite(Number(pct)))
      ? Math.round(Number(pct)) + "% skill match at apply time" : null);
    var missing = (elig.missing_skills || []).map(function (m) {
      return m && (m.skill_name || m.skill_id);
    }).filter(Boolean);
    setFact("appSnapMissing", missing.length ? missing.join(", ") : null);
  }
  /* recruiter review controls (frontend mirrors the server transition map) */
  var badge = $("appReviewStatusBadge");
  if (badge) {
    badge.innerHTML = appBadge(a.status) +
      (a.status_changed_at ? ' <span class="muted" style="font-size:10px">since ' +
        esc(fmtDate(a.status_changed_at)) + "</span>" : "");
  }
  var sel = $("appStatusSelect");
  var targets = appTargets(a.status);
  if (sel) {
    sel.innerHTML = targets.length
      ? targets.map(function (t) {
        return '<option value="' + t + '">' + esc(appMeta(t).label) + "</option>";
      }).join("")
      : '<option value="">— final —</option>';
    sel.disabled = !targets.length;
  }
  S.review.origNote = clean(a.recruiter_note);
  var reasonIn = $("appReasonInput");
  if (reasonIn) reasonIn.value = clean(a.rejection_reason);
  show($("appReasonWrap"), targets.indexOf("rejected") !== -1);
  var noteIn = $("appNoteInput");
  if (noteIn) noteIn.value = clean(a.recruiter_note);
  updateNoteCount();
  setReviewMsg("");
  var errBox = $("appReviewError");
  if (errBox) errBox.hidden = true;
  show($("appReviewBody"), true);
  var save = $("appSaveStatus");
  if (save) { save.disabled = false; save.textContent = "Save status"; }
  show($("appReview"), true);
}
function closeReview() {
  S.review.item = null;
  S.review.busy = false;
  show($("appReview"), false);
}
/* Server truth after every mutation: the PATCH response (the same
   _serialize_applicant shape) replaces the local row; the list is
   resynced when a status filter may exclude the moved row. */
function saveStatus() {
  var item = S.review.item;
  if (!item || S.review.busy) return;
  var a = item.application || {};
  var sel = $("appStatusSelect");
  var target = sel ? clean(sel.value) : "";
  if (!target) return;
  var payload = { status: target };
  /* The note is sent only when the recruiter actually changed it — the
     backend preserves the previous note when the field is omitted, and a
     cleared field can never wipe it (server keeps it too). */
  var note = clean($("appNoteInput") ? $("appNoteInput").value : "");
  if (note && note !== S.review.origNote) payload.recruiter_note = note;
  if (target === "rejected") {
    var reason = clean($("appReasonInput") ? $("appReasonInput").value : "");
    if (!reason) {
      setReviewMsg("A rejection reason is required before rejecting.");
      return;
    }
    payload.rejection_reason = reason;
  }
  S.review.busy = true;
  var save = $("appSaveStatus");
  if (save) { save.disabled = true; save.textContent = "Saving…"; }
  setReviewMsg("");
  API.updateApplicationStatus(a.id, payload).then(function (res) {
    S.review.busy = false;
    var updated = (res && res.application) ? res : {
      application: Object.assign({}, a, { status: target }),
      opportunity: item.opportunity, student: item.student
    };
    S.review.item = updated;
    var id = Number(updated.application.id);
    S.applicants.rows = S.applicants.rows.map(function (r) {
      return r && r.application && Number(r.application.id) === id ? updated : r;
    });
    renderApplicants();
    if (S.applicants.status) loadApplicants(0);
    openReview(updated);
    toast("Application moved to " + appMeta(updated.application.status).label + ".");
  }).catch(function (e) {
    S.review.busy = false;
    if (save) save.disabled = false;
    handleStatusError(e);
  }).then(function () {
    if (save) save.textContent = "Save status";
  });
}
function handleStatusError(e) {
  var st = e && e.status;
  if (st === 401) {
    setReviewMsg("Your session has expired. Please sign in again.");
    toast("Your session has expired. Please sign in again.");
    return;
  }
  if (st === 403) { setReviewMsg("Only the opportunity owner can update this application."); return; }
  if (st === 404) { setReviewMsg("This application no longer exists."); return; }
  if (st === 409) {
    /* Stale view / concurrent move: the server is truth — refetch the
       list and re-render from the fresh row; close if the row left the
       current filtered view. Never fake success. */
    setReviewMsg(readableDetail(e) || "Application status changed — reloading the latest state.");
    reloadConflicted();
    return;
  }
  if (st === 422) {
    setReviewMsg(readableDetail(e) || "Please check the rejection reason and note, then try again.");
    return;
  }
  if (st === 0 || (st && st >= 500)) {
    setReviewMsg("Something went wrong. Please try again.");
    return;
  }
  setReviewMsg(readableDetail(e) || "Could not update the application status.");
}
function reloadConflicted() {
  var id = S.review.item ? Number((S.review.item.application || {}).id) : null;
  var save = $("appSaveStatus");
  if (save) save.disabled = true;
  loadApplicants(0).then(function () {
    if (save) save.disabled = false;
    if (id == null) return;
    var fresh = appFind(id);
    if (fresh) {
      S.review.item = fresh;
      openReview(fresh);
      setReviewMsg("Application was updated elsewhere — showing the latest status.");
    } else {
      closeReview();
      toast("This application is no longer in the current view.");
    }
  });
}

/* ---------------- list click handler ---------------- */
function onListClick(ev) {
  var t = ev.target;
  if (t.nodeName !== "BUTTON" && t.nodeName !== "A") return;
  var act = t.getAttribute("data-act");
  if (!act) return;
  var art = t.closest("article");
  var id = art ? Number(art.getAttribute("data-id")) : null;
  if (!id) return;
  ev.preventDefault();
  if (act === "edit") { openComposerForEdit(id); }
  else if (act === "publish") { closeComposer(); cardPublish(id); }
  else if (act === "close") { closeComposer(); cardClose(id); }
  else if (act === "archive") { closeComposer(); cardArchive(id); }
  else if (act === "applicants") {
    /* STAGE 9.3 — opportunity -> applicants navigation. */
    var row = null;
    for (var i = 0; i < S.rows.length; i++) {
      if (Number(S.rows[i].id) === id) { row = S.rows[i]; break; }
    }
    if (row) { closeComposer(); closeReview(); openApplicants(row); }
  }
  else if (act === "delete") { cardDelete(id); }
}

/* close from composer (for published rows) */
function closeOpportunityComposer() {
  if (!S.editing || !S.editing.id) return;
  askConfirm({
    title: "Close opportunity?",
    message: "Close this opportunity? Students will no longer see it as an active opportunity.",
    okLabel: "Close"
  }).then(function (ok) {
    if (!ok) return;
    API.closeOpportunity(S.editing.id).then(function () {
      S.rows = S.rows.map(function (r) { if (Number(r.id) === S.editing.id) r = Object.assign({}, r, { status: "closed" }); return r; });
      renderList();
      toast("Opportunity closed.");
      loadList();
      closeComposer();
    }).catch(function (e) { toast(actionToast(e, "Could not close this opportunity.")); loadList(); });
  });
}

/* ---------------- DOM wiring ---------------- */
function bindUI() {
  /* ---- STAGE 9.3: applicant review wiring (additive) ---- */
  var appClose = $("appCloseList");
  if (appClose) appClose.addEventListener("click", closeApplicants);
  var appRetry = $("appRetry");
  if (appRetry) appRetry.addEventListener("click", function () { loadApplicants(0); });
  var appMore = $("appLoadMore");
  if (appMore) appMore.addEventListener("click", function () { loadApplicants(S.applicants.offset); });
  var appFilter = $("appStatusFilter");
  if (appFilter) appFilter.addEventListener("change", function () {
    S.applicants.status = clean(this.value).toLowerCase();
    loadApplicants(0);
  });
  var appSearch = $("appSearch");
  if (appSearch) appSearch.addEventListener("input", function () {
    if (S.applicants.searchTimer) clearTimeout(S.applicants.searchTimer);
    S.applicants.searchTimer = setTimeout(function () {
      S.applicants.q = clean(appSearch.value);
      loadApplicants(0);
    }, 300);
  });
  var appList = $("appList");
  if (appList) appList.addEventListener("click", function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest("[data-app-review]") : null;
    if (!b) return;
    var item = appFind(Number(b.getAttribute("data-app-review")));
    if (item) openReview(item);
  });
  var appReviewX = $("appReviewX");
  if (appReviewX) appReviewX.addEventListener("click", closeReview);
  var appReviewClose2 = $("appReviewClose2");
  if (appReviewClose2) appReviewClose2.addEventListener("click", closeReview);
  var appReviewOv = $("appReview");
  if (appReviewOv) appReviewOv.addEventListener("click", function (ev) {
    if (ev.target === appReviewOv) closeReview();
  });
  var appSave = $("appSaveStatus");
  if (appSave) appSave.addEventListener("click", saveStatus);
  var appNote = $("appNoteInput");
  if (appNote) appNote.addEventListener("input", updateNoteCount);
  var appReviewRetry = $("appReviewRetry");
  if (appReviewRetry) appReviewRetry.addEventListener("click", function () {
    var id = S.review.item ? Number((S.review.item.application || {}).id) : null;
    loadApplicants(0).then(function () {
      var fresh = id != null ? appFind(id) : null;
      if (fresh) { S.review.item = fresh; openReview(fresh); }
      else closeReview();
    });
  });
  var tabs = document.querySelectorAll("#jobsTabs button");
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabs.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      S.status = btn.getAttribute("data-status") || "";
      renderList();
    });
  });
  var search = $("jobsSearch");
  if (search) search.addEventListener("input", function () {
    S.q = clean(this.value);
    renderList();
  });
  var tf = $("jobsTypeFilter"); if (tf) tf.addEventListener("change", function () { S.type = clean(this.value).toLowerCase(); renderList(); });
  var mf = $("jobsModeFilter"); if (mf) mf.addEventListener("change", function () { S.mode = clean(this.value).toLowerCase(); renderList(); });
  var clear = $("jobsClearFilters"); if (clear) clear.addEventListener("click", function () {
    S.status = ""; S.type = ""; S.mode = ""; S.q = "";
    if (search) search.value = "";
    if (tf) tf.value = "";
    if (mf) mf.value = "";
    tabs.forEach(function (b) { b.classList.remove("active"); });
    tabs[0] && tabs[0].classList.add("active");
    renderList();
  });
  var postBtn = $("jobsPostBtn");
  if (postBtn) postBtn.addEventListener("click", function (e) {
    if (S.role !== "recruiter") { e.preventDefault(); return; }
    closeComposer();
    openComposer(null);
  });
  var emptyPost = $("jobsEmptyPost");
  if (emptyPost) emptyPost.addEventListener("click", function () { openComposer(null); });
  var rows = $("jobsRows");
  if (rows) rows.addEventListener("click", onListClick);
  var retry = $("jobsRetry");
  if (retry) retry.onclick = function () { loadList(); };
  var saveDraftBtn = $("jobsSaveDraftBtn"); if (saveDraftBtn) saveDraftBtn.addEventListener("click", function (ev) { ev.preventDefault(); if (saveDraftBtn.disabled) return; try { var r = saveDraft(); if (r && r.catch) r.catch(function(){}); } catch (e) {} });
  var saveChangesBtn = $("jobsSaveChangesBtn"); if (saveChangesBtn) saveChangesBtn.addEventListener("click", function (ev) { ev.preventDefault(); if (saveChangesBtn.disabled) return; try { var r2 = saveDraft(); if (r2 && r2.catch) r2.catch(function(){}); } catch (e) {} });
  var publishBtn = $("jobsPublishBtn"); if (publishBtn) publishBtn.addEventListener("click", function (ev) { ev.preventDefault(); if (publishBtn.disabled) return; try { var r3 = publishComposer(); if (r3 && r3.catch) r3.catch(function(){}); } catch (e) {} });
  var closeBtn = $("jobsCloseBtn"); if (closeBtn) closeBtn.addEventListener("click", function (ev) { ev.preventDefault(); if (closeBtn.disabled) return; closeOpportunityComposer(); });
  var cancelBtn = $("jobsCancelBtn"); if (cancelBtn) cancelBtn.addEventListener("click", function (ev) { ev.preventDefault(); closeComposer(); });
  var modalClose = $("jobsModalClose"); if (modalClose) modalClose.addEventListener("click", function () { closeComposer(); });
  var skillSearch = $("jobsSkillSearch");
  if (skillSearch) skillSearch.addEventListener("input", function () {
    if (S.skillSearchTimer) clearTimeout(S.skillSearchTimer);
    S.skillSearchTimer = setTimeout(function () { searchSkills(skillSearch.value); }, 300);
  });
  var skillSel = $("jobsSkillSelected");
  if (skillSel) {
    skillSel.addEventListener("change", function (ev) {
      var s = ev.target; if (s.nodeName !== "SELECT") return;
      var k = s.getAttribute("data-k"); var i = +s.closest("[data-i]").getAttribute("data-i");
      if (S.skills[i]) S.skills[i][k] = s.value;
    }, true);
    skillSel.addEventListener("click", function (ev) {
      var b = ev.target; if (b.nodeName !== "BUTTON" || b.getAttribute("data-rm") == null) return;
      S.skills.splice(+b.getAttribute("data-rm"), 1);
      renderSelected();
    });
  }
  var skillResults = $("jobsSkillResults");
  if (skillResults) skillResults.addEventListener("click", function (ev) {
    var b = ev.target;
    if (b.nodeName !== "BUTTON" || b.getAttribute("data-add") == null) return;
    var id = Number(b.getAttribute("data-add"));
    if (S.skills.some(function (s) { return Number(s.skill_id) === id; })) return;
    S.skills.push({ skill_id: id, skill_name: b.getAttribute("data-name") || "", required_level: "intermediate", importance: "medium", skill_type: "required" });
    renderSelected();
    if (skillSearch) skillSearch.value = "";
    skillResults.innerHTML = "";
  });
  var confirmOk = $("jobsConfirmOk"); if (confirmOk) confirmOk.addEventListener("click", function () { settleConfirm(true); });
  var confirmCancel = $("jobsConfirmCancel"); if (confirmCancel) confirmCancel.addEventListener("click", function () { settleConfirm(false); });
  var confirmEl = $("jobsConfirm"); if (confirmEl) confirmEl.addEventListener("click", function (ev) { if (ev.target === confirmEl) settleConfirm(false); });
}

/* ---------------- boot ---------------- */
function refreshAll() { loadProfile().then(loadList, loadList); }
function boot() {
  if (!window.SkillShareAPI) {
    showListError("SkillShare API is unavailable.");
    return;
  }
  AUTH = window.SkillShareAuth || {};
  if (AUTH.requireUser) {
    AUTH.requireUser().then(function (user) {
      S.user = user; S.role = user.role || "";
      if (S.role === "recruiter") {
        show($("jobsPostBtn"), true);
      } else {
        var pb = $("jobsPostBtn"); if (pb) pb.style.display = "none";
      }
      bindUI();
      refreshAll();
    }).catch(function (e) {
      showState("error");
      var em = $("jobsErrorMsg"); if (em) em.textContent = (e && e.detail) || "Your session has expired. Please sign in again.";
      show($("jobsRows"), false);
      show($("jobsLoading"), false);
      bindUI();
      var retry = $("jobsRetry");
      if (retry) retry.onclick = function () { refreshAll(); };
    });
  } else {
    S.role = "recruiter";
    bindUI();
    refreshAll();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

window.__jobs = window.__jobs || {};
window.__jobs.boot = boot;
window.__jobs.bindUI = bindUI;
})(); /* end IIFE */







