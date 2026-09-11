/* SKILLSHARE PHASE1 wizard part 1: role step + helpers */
(() => {
"use strict";
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const PUBLIC_ROLES = ["student", "recruiter", "mentor"];
const state = { role: null, mode: "roles", reviewing: false, chips: {} };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)\S+\.\S+/i;
function toast(msg, type) {
    let t = $("#signupToast");
    if (!t) { t = document.createElement("div"); t.id = "signupToast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "signup-toast " + (type || "info");
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(window.__st);
    window.__st = setTimeout(() => t.classList.remove("show"), 2600);
}
function setDot(n) { $$("#stepsBar li").forEach((li) => li.classList.toggle("active", Number(li.dataset.stepDot) <= n)); }
function setErr(id, m) { const e = document.getElementById(id); if (e) e.textContent = m || ""; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function checkedVals(k) { return $$('[data-check-group="' + k + '"]', document).filter((c) => c.checked).map((c) => c.value); }
function show(which) {
    state.mode = which;
    $("#stepRole").hidden = which !== "roles";
    $("#signupForm").hidden = !(which === "form" || which === "review");
    $("#adminForm").hidden = which !== "admin";
    $("#stepSuccess").hidden = which !== "success";
    const title = $("#stepTitle"), sub = $("#stepSubtitle");
    if (which === "roles") { setDot(1); title.innerHTML = "Who <em>are you?</em>"; sub.textContent = "Choose the path that fits you best."; }
    if (which === "admin") { setDot(1); title.innerHTML = "Admin <em>access</em>"; sub.textContent = "Request elevated access. A pending request is sent to the main administrator."; }
    if (which === "success") { setDot(4); }
}

/* part2 */
function fieldWrap(inner, errId) {
    return '<label><div class="field">' + inner + '</div>' + (errId ? '<small class="error" id="' + errId + '"></small>' : '') + '</label>';
}
function textField(id, icon, ph, type) {
    return fieldWrap('<span>' + icon + '</span><input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) + '">', id + 'Error');
}
function selectField(id, icon, ph, opts) {
    let h = '<span>' + icon + '</span><select id="' + id + '"><option value="">' + esc(ph) + '</option>';
    opts.forEach((o) => { h += '<option value="' + esc(o) + '">' + esc(o) + '</option>'; });
    return fieldWrap(h + '</select>', id + 'Error');
}
function chipEditor(key, label, ph) {
    state.chips[key] = state.chips[key] || [];
    return '<span class="lbl">' + esc(label) + '</span><div class="chip-input-row"><input id="chipInput_' + key + '" type="text" placeholder="' + esc(ph || label) + '"><button type="button" class="chip-add" data-chip-add="' + key + '">Add</button></div><div class="chips" id="chips_' + key + '"></div>';
}
function checkPills(key, label, opts) {
    let h = '<span class="lbl">' + esc(label) + '</span><div class="check-row">';
    opts.forEach((o) => { h += '<label class="check-pill"><input type="checkbox" data-check-group="' + key + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>'; });
    return h + '</div>';
}
function commonFields(workEmail) {
    return '<div class="section-title">Account</div><div class="grid-2">' + textField('f_name', 'N', 'Full Name') + textField('f_phone', 'P', 'Phone Number', 'tel') + '</div>' + textField('f_email', 'E', workEmail ? 'Work Email' : 'Email', 'email') + '<div class="grid-2">' + textField('f_password', 'K', 'Password', 'password') + textField('f_confirm', 'K', 'Confirm Password', 'password') + '</div>';
}
function renderChips(key) {
    const wrap = document.getElementById('chips_' + key);
    if (!wrap) return;
    wrap.innerHTML = '';
    state.chips[key].forEach((v, i) => {
        const s = document.createElement('span');
        s.className = 'chip'; s.textContent = v + ' ';
        const x = document.createElement('button');
        x.type = 'button'; x.textContent = 'x';
        x.addEventListener('click', () => { state.chips[key].splice(i, 1); renderChips(key); });
        s.appendChild(x); wrap.appendChild(s);
    });
}

/* part3 */
function buildForm() {
    show('form'); setDot(2);
    const box = $('#dynamicFields');
    $('#reviewBox').hidden = true; $('#reviewBox').innerHTML = '';
    const titles = { student: 'Student <em>details</em>', recruiter: 'Recruiter <em>details</em>', mentor: 'Mentor <em>details</em>' };
    $('#stepTitle').innerHTML = titles[state.role] || 'Your <em>details</em>';
    $('#stepSubtitle').textContent = 'Step 2 of 4. Nothing here can grant admin access.';
    state.chips = {};
    const degrees = ['B.Tech', 'B.E.', 'BCA', 'MCA', 'M.Tech', 'M.Sc.', 'Diploma', 'Other'];
    const branches = ['CSE', 'IT', 'ECE', 'Mechanical', 'Civil', 'Electrical', 'Other'];
    if (state.role === 'student') {
        const y = new Date().getFullYear(); const years = [];
        for (let k = y - 4; k <= y + 6; k++) years.push(String(k));
        box.innerHTML = commonFields(false)
            + '<div class="section-title">Academic</div>' + textField('f_college', 'C', 'College / Institution')
            + '<div class="grid-2">' + selectField('f_degree', 'D', 'Degree', degrees) + selectField('f_branch', 'B', 'Branch', branches) + '</div>'
            + '<div class="grid-2">' + selectField('f_gradyear', 'Y', 'Graduation Year', years) + textField('f_semester', 'S', 'Current Semester / Year') + '</div>'
            + textField('f_cgpa', 'G', 'CGPA (0 - 10)', 'number')
            + '<div class="section-title">Skills</div>' + chipEditor('top_skills', 'Top Skills', 'e.g. Communication') + chipEditor('prog_langs', 'Programming Languages', 'e.g. Python') + chipEditor('techs', 'Technologies / Tools', 'e.g. FastAPI')
            + '<div class="section-title">Career</div><div class="grid-2">' + textField('f_target_role', 'T', 'Target Job Role') + textField('f_industry', 'I', 'Preferred Industry') + '</div>'
            + checkPills('looking_for', 'Looking For', ['Jobs', 'Internships', 'Projects', 'Mentorship']);
    } else if (state.role === 'recruiter') {
        box.innerHTML = commonFields(true) + textField('f_jobtitle', 'J', 'Your Job Title')
            + '<div class="section-title">Company</div>' + textField('f_company', 'C', 'Company Name')
            + '<div class="grid-2">' + textField('f_website', 'W', 'Company Website (https://...)') + textField('f_industry', 'I', 'Industry') + '</div>'
            + '<div class="grid-2">' + selectField('f_size', 'S', 'Company Size', ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']) + textField('f_location', 'L', 'Company Location') + '</div>'
            + textField('f_reg', 'R', 'Company Registration / ID Information')
            + '<div class="section-title">Recruitment</div>' + chipEditor('hiring_for', 'Hiring For', 'e.g. Interns') + chipEditor('job_roles', 'Job Roles', 'e.g. Backend Intern') + chipEditor('req_skills', 'Required Skills', 'e.g. Python')
            + selectField('f_intern', 'V', 'Internship Availability', ['Yes', 'No', 'Occasionally'])
            + '<p class="role-hint">Company verification stays <b>pending</b> until reviewed.</p>';
    } else {
        box.innerHTML = commonFields(false)
            + '<div class="section-title">Professional</div><div class="grid-2">' + textField('f_jobtitle', 'J', 'Current Job Title') + textField('f_company', 'C', 'Company') + '</div>'
            + '<div class="grid-2">' + textField('f_industry', 'I', 'Industry') + textField('f_exp', 'Y', 'Years of Experience', 'number') + '</div>'
            + chipEditor('m_skills', 'Skills', 'e.g. System Design') + chipEditor('m_expertise', 'Areas of Expertise', 'e.g. Interviews')
            + '<div class="section-title">Professional Links</div>' + textField('f_linkedin', 'L', 'LinkedIn URL (https://...)')
            + '<div class="grid-2">' + textField('f_portfolio', 'G', 'Portfolio URL') + textField('f_github', 'H', 'GitHub URL') + '</div>'
            + '<div class="section-title">Mentorship</div>' + checkPills('avail_days', 'Available Days', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
            + textField('f_hours', 'T', 'Available Hours (e.g. Evenings 6-8pm)') + chipEditor('m_topics', 'Mentorship Topics', 'e.g. Resume review')
            + checkPills('m_types', 'Preferred Mentorship Types', ['1-on-1 mentoring', 'Mock interviews', 'Resume review', 'Career guidance', 'Guest lectures', 'Real-world projects'])
            + '<span class="lbl">Professional Bio</span><textarea id="f_bio" rows="3" placeholder="A short professional bio"></textarea>';
    }
    $$('[data-chip-add]', box).forEach((btn) => btn.addEventListener('click', () => {
        const key = btn.dataset.chipAdd;
        const input = document.getElementById('chipInput_' + key);
        const v = (input.value || '').trim();
        if (!v) return;
        if (state.chips[key].length >= 30) { toast('Too many items (max 30).', 'error'); return; }
        state.chips[key].push(v); input.value = '';
        renderChips(key);
    }));
    $('#submitBtn').hidden = true; $('#reviewBtn').hidden = false;
    setErr('formError', '');
}

/* part4a: validation + payload */
function validateCommon() {
    let ok = true;
    const name = val('f_name');
    setErr('f_nameError', name.length < 2 ? 'Enter your full name.' : '');
    if (name.length < 2) ok = false;
    const email = val('f_email');
    setErr('f_emailError', EMAIL_RE.test(email) ? '' : 'Enter a valid email address.');
    if (!EMAIL_RE.test(email)) ok = false;
    const phone = val('f_phone');
    const digits = phone.replace(/\D/g, '');
    setErr('f_phoneError', (!phone || (digits.length >= 7 && digits.length <= 15)) ? '' : 'Enter a valid phone number.');
    if (phone && !(digits.length >= 7 && digits.length <= 15)) ok = false;
    const pw = document.getElementById('f_password').value;
    const cf = document.getElementById('f_confirm').value;
    setErr('f_passwordError', pw.length >= 6 ? '' : 'Password must be at least 6 characters.');
    setErr('f_confirmError', pw === cf ? '' : 'Passwords do not match.');
    if (pw.length < 6 || pw !== cf) ok = false;
    return ok;
}
function validateRole() {
    let ok = validateCommon();
    const bad = (id, msg) => { setErr(id + 'Error', msg); if (msg) ok = false; };
    if (state.role === 'student') {
        const cg = val('f_cgpa');
        bad('f_cgpa', cg !== '' && !(Number(cg) >= 0 && Number(cg) <= 10) ? 'CGPA must be between 0 and 10.' : '');
        const gy = val('f_gradyear');
        bad('f_gradyear', gy !== '' && !(Number(gy) >= 1990 && Number(gy) <= 2100) ? 'Graduation year is invalid.' : '');
    }
    if (state.role === 'recruiter') {
        const w = val('f_website');
        bad('f_website', w !== '' && !URL_RE.test(w) ? 'Company website URL is invalid.' : '');
    }
    if (state.role === 'mentor') {
        const ex = val('f_exp');
        bad('f_exp', ex !== '' && !(Number(ex) >= 0 && Number(ex) <= 80) ? 'Years of experience is invalid.' : '');
        ['f_linkedin', 'f_portfolio', 'f_github'].forEach((id) => {
            const u = val(id);
            bad(id, u !== '' && !URL_RE.test(u) ? 'URL must start with https:// or www.' : '');
        });
    }
    return ok;
}
function collectPayload() {
    const profile = {};
    if (state.role === 'student') {
        Object.assign(profile, { college: val('f_college'), degree: val('f_degree'), branch: val('f_branch'), graduation_year: val('f_gradyear') === '' ? null : Number(val('f_gradyear')), semester: val('f_semester'), cgpa: val('f_cgpa') === '' ? null : Number(val('f_cgpa')), top_skills: state.chips.top_skills || [], programming_languages: state.chips.prog_langs || [], technologies: state.chips.techs || [], target_job_role: val('f_target_role'), preferred_industry: val('f_industry'), looking_for: checkedVals('looking_for') });
    } else if (state.role === 'recruiter') {
        Object.assign(profile, { job_title: val('f_jobtitle'), company_name: val('f_company'), company_website: val('f_website'), industry: val('f_industry'), company_size: val('f_size'), company_location: val('f_location'), company_registration: val('f_reg'), hiring_for: state.chips.hiring_for || [], job_roles: state.chips.job_roles || [], required_skills: state.chips.req_skills || [], internship_availability: val('f_intern') });
    } else {
        Object.assign(profile, { job_title: val('f_jobtitle'), company: val('f_company'), industry: val('f_industry'), years_experience: val('f_exp') === '' ? null : Number(val('f_exp')), skills: state.chips.m_skills || [], expertise_areas: state.chips.m_expertise || [], linkedin_url: val('f_linkedin'), portfolio_url: val('f_portfolio'), github_url: val('f_github'), available_days: checkedVals('avail_days'), available_hours: val('f_hours'), mentorship_topics: state.chips.m_topics || [], mentorship_types: checkedVals('m_types'), bio: val('f_bio') });
    }
    return { name: val('f_name'), email: val('f_email'), password: document.getElementById('f_password').value, role: state.role, phone: val('f_phone') || null, profile };
}

/* part5: review + submit + admin + boot */
function onBack() {
    if (state.mode === 'review') {
        state.reviewing = false; show('form'); setDot(2);
        $('#reviewBox').hidden = true; $('#dynamicFields').hidden = false;
        $('#submitBtn').hidden = true; $('#reviewBtn').hidden = false;
        $('#stepSubtitle').textContent = 'Step 2 of 4. Nothing here can grant admin access.';
        return;
    }
    show('roles');
}
function onReview() {
    if (!validateRole()) { setErr('formError', 'Please fix the highlighted fields.'); return; }
    setErr('formError', '');
    state.reviewing = true;
    show('review'); setDot(3);
    $('#stepTitle').innerHTML = 'Review <em>information</em>';
    $('#stepSubtitle').textContent = 'Step 3 of 4. Check everything before creating your account.';
    const d = collectPayload();
    const rows = [['Role', d.role], ['Full Name', d.name], ['Email', d.email], ['Phone', d.phone || '-']];
    Object.keys(d.profile || {}).forEach((k) => {
        const v = d.profile[k];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
        rows.push([k.replace(/_/g, ' '), Array.isArray(v) ? v.join(', ') : String(v)]);
    });
    $('#dynamicFields').hidden = true;
    const box = $('#reviewBox');
    box.hidden = false;
    box.innerHTML = '<dl>' + rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>';
    $('#reviewBtn').hidden = true; $('#submitBtn').hidden = false;
}
async function onSubmit(e) {
    e.preventDefault();
    if (!validateRole()) { setErr('formError', 'Please fix the highlighted fields.'); return; }
    if (!state.reviewing) { onReview(); return; }
    const btn = $('#submitBtn');
    btn.disabled = true;
    try {
        const d = collectPayload();
        const res = await window.SkillShareAPI.signup(d.name, d.email, d.password, { role: d.role, phone: d.phone, profile: d.profile });
        const user = (res && res.user) || {};
        $('#successTitle').textContent = 'Account created!';
        $('#successMsg').textContent = 'Welcome, ' + (user.name || d.name) + ' (' + (user.role || d.role) + '). Redirecting to sign in...';
        show('success'); toast('Welcome ' + (user.name || d.name) + '!', 'success');
        setTimeout(() => { window.location.href = 'login.html'; }, 1400);
    } catch (err) {
        setErr('formError', (err && (err.detail || err.message)) || 'Signup failed. Please try again.');
        toast((err && (err.detail || err.message)) || 'Signup failed.', 'error');
    } finally { btn.disabled = false; }
}
async function onAdminSubmit(e) {
    e.preventDefault();
    const name = val('adminName'), email = val('adminEmail'), phone = val('adminPhone'), reason = val('adminReason');
    let ok = true;
    setErr('adminNameError', name.length < 2 ? 'Enter your full name.' : ''); if (name.length < 2) ok = false;
    setErr('adminEmailError', EMAIL_RE.test(email) ? '' : 'Enter a valid email address.'); if (!EMAIL_RE.test(email)) ok = false;
    const digits = phone.replace(/\D/g, '');
    setErr('adminPhoneError', (!phone || (digits.length >= 7 && digits.length <= 15)) ? '' : 'Enter a valid phone number.');
    if (phone && !(digits.length >= 7 && digits.length <= 15)) ok = false;
    setErr('adminReasonError', reason.length >= 10 ? '' : 'Please explain (min 10 characters).'); if (reason.length < 10) ok = false;
    if (!ok) return;
    const btn = $('#adminSubmitBtn');
    btn.disabled = true;
    try {
        const res = await window.SkillShareAPI.requestAdminAccess({ full_name: name, email, phone: phone || null, organization: val('adminOrg') || null, current_role: val('adminRole') || null, reason });
        const rid = res && res.request && res.request.id;
        $('#successTitle').textContent = 'Request submitted!';
        $('#successMsg').textContent = 'Your admin access request #' + rid + ' is pending review.';
        show('success'); toast('Admin request #' + rid + ' submitted.', 'success');
    } catch (err) {
        setErr('adminFormError', (err && (err.detail || err.message)) || 'Request failed. Please try again.');
    } finally { btn.disabled = false; }
}
document.addEventListener('DOMContentLoaded', () => {
    $$('.role-card').forEach((card) => card.addEventListener('click', () => {
        $$('.role-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state.role = card.dataset.role;
        $('#continueRoleBtn').disabled = false;
        $('#roleHint').textContent = 'Selected: ' + card.querySelector('strong').textContent + '. Click Continue.';
    }));
    $('#continueRoleBtn').addEventListener('click', () => {
        if (!state.role || PUBLIC_ROLES.indexOf(state.role) === -1) { toast('Please select a role first.', 'error'); return; }
        state.reviewing = false;
        buildForm();
    });
    $('#showAdminRequest').addEventListener('click', () => show('admin'));
    $('#adminBackBtn').addEventListener('click', () => show('roles'));
    $('#backBtn').addEventListener('click', onBack);
    $('#reviewBtn').addEventListener('click', onReview);
    $('#signupForm').addEventListener('submit', onSubmit);
    $('#adminForm').addEventListener('submit', onAdminSubmit);
    document.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        const r = document.createElement('span');
        r.className = 'ripple';
        const rect = b.getBoundingClientRect();
        r.style.left = (ev.clientX - rect.left) + 'px';
        r.style.top = (ev.clientY - rect.top) + 'px';
        b.appendChild(r);
        setTimeout(() => r.remove(), 650);
    });
    show('roles');
});
})();
