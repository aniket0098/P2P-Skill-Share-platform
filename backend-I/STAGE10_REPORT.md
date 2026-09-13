# Stage 10 — CareerVerse + Career Progress Data Foundation

## 1. Inspection Summary

Inspected: `careerverse.html` (static placeholder), `SkillHistory` (skill-level only), `Activity` (general), `stage5_service.py` (readiness engine), `stage6_service.py` (evidence), `stage7_service.py` (sandbox), `stage8_service.py` (innovation), `stage9_service.py` (career context), `stage9_api.py` (career coach endpoints), `skill_engine.py` (deterministic math), `main.py` (registration pattern), `api-client.js` (frontend API), `design-system.css` (existing styles).

## 2. Existing CareerVerse Functionality

**None.** The page was a static HTML placeholder with no backend connection.

## 3. Existing Tables/Models Reused

`User`, `StudentProfile`, `Education`, `Skill`, `UserSkill`, `SkillEvidence`, `SkillHistory`, `LearningRecord`, `Project`, `SandboxChallenge`, `SandboxParticipant`, `SandboxSubmission`, `InnovationIdea`, `InnovationMilestone`, `JobRole`, `RoleSkill`, `IndustryDomain`, `Activity`, `CareerCoachConversation`.

## 4. New Tables/Models Created

**`career_events`** — `CareerEvent`: id, user_id (FK→users, indexed), event_type, title, description, source_type, source_id, metadata_json, created_at. Unique on (user_id, event_type, source_type, source_id). 18 event types in `CAREER_EVENT_TYPES`. 10 source types in `CAREER_EVENT_SOURCES`.

**`career_goals`** — `CareerGoal`: id, user_id (FK→users, indexed), target_role, target_domain, target_level, target_date, status, note, created_at, updated_at. 4 statuses in `CAREER_GOAL_STATUS`.

## 5. Migrations

None (additive). Tables created by `Base.metadata.create_all()` on first backend start. `seed_careerverse.py` backfills from historical data.

## 6. New API Endpoints (all JWT-auth, user from token)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/careerverse/overview` | Career snapshot |
| GET | `/api/careerverse/timeline` | Career Replay |
| GET | `/api/careerverse/roadmap` | Career roadmap |
| GET | `/api/careerverse/next-mission` | Next action |
| GET | `/api/careerverse/goals` | List goals |
| POST | `/api/careerverse/goals` | Create/update goal |
| POST | `/api/careerverse/simulate` | What-if simulation |

## 7. Career Event Architecture

`record_career_event()` (idempotent) + `backfill_career_events()` (historical backfill on first visit). Events only from real data, traceable via source_type + source_id.

## 8-11. Roadmap / Mission / Goals / Simulation

Roadmap: 8 stages from real state. Mission: delegates to Stage 9 engine. Goals: idempotent active goal. Simulation: uses Stage 5 deterministic `score_role` with projected levels.
