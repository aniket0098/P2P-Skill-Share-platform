/* AI Career Coach Widget for Dashboard (Stage 9) */
(function () {
  "use strict";

  const S = window.SkillShareAPI;
  if (!S) return;

  async function loadCareerWidget() {
    const section = document.getElementById("dashboardCareerCoach");
    if (!section) return;

    try {
      const ctx = await S.getCareerContext();
      if (!ctx) return;

      const target = (ctx.target_role || {}).title || null;
      const readiness = ctx.readiness || {};
      const gaps = ctx.skill_gaps || [];
      const topGap = gaps.length ? gaps[0].skill_name : null;

      document.getElementById("cc-widget-target").textContent = target || "Set a target role";
      document.getElementById("cc-widget-readiness").textContent = readiness.score != null
        ? readiness.score + "% — " + (readiness.level || "")
        : "No target role";
      document.getElementById("cc-widget-gap").textContent = topGap || "No gaps detected";

      const missionEl = document.getElementById("cc-widget-mission");
      try {
        const recs = await S.getCareerRecommendations();
        if (recs && recs.next_mission) {
          missionEl.textContent = "Your next mission: " + recs.next_mission.title + " — " + recs.next_mission.action;
        } else if (topGap) {
          missionEl.textContent = "Your biggest opportunity right now: Build evidence for " + topGap + ".";
        }
      } catch (e) {
        if (topGap) {
          missionEl.textContent = "Your biggest opportunity right now: Build evidence for " + topGap + ".";
        }
      }

      section.style.display = "block";
    } catch (e) {
      // Widget stays hidden on error — graceful degradation
    }
  }

  document.addEventListener("DOMContentLoaded", loadCareerWidget);
})();
