# SkillConnect (SkillShare) — Peer-to-Peer Skill Sharing Platform

A peer-to-peer platform where members exchange skills: create a profile listing
the skills you can teach and want to learn, find other members, send connection
requests, chat, and track your learning activity on a personal dashboard.

## Technology Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Frontend   | HTML, CSS, Vanilla JavaScript               |
| Backend    | Python FastAPI (uvicorn)                    |
| Database   | PostgreSQL                                  |
| ORM        | SQLAlchemy 2.x                              |
| Auth       | JWT (python-jose) + bcrypt password hashing (passlib) |

## Project Structure

```
.
├── backend-I/                 # FastAPI backend
│   ├── main.py                # App, routes, startup migrations
│   ├── database.py            # SQLAlchemy engine/session (from DATABASE_URL)
│   ├── config.py              # Environment-variable configuration
│   ├── auth.py                # Password hashing + JWT helpers
│   ├── models.py              # SQLAlchemy models
│   ├── seed_demo.py           # OPTIONAL dev-only demo data seeder
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # Environment variable template (no real values)
├── peer to peer skill share/  # Frontend (static site)
│   ├── config.js              # Centralized API base URL
│   ├── api-client.js          # Single fetch layer for the FastAPI API
│   ├── *.html / *.css / *.js  # Pages and their logic
│   └── assets/                # Images / illustrations
├── start-skillshare.bat       # Local dev launcher (Windows)
└── README.md
```

## Local Setup

### 1. Python virtual environment

```bash
cd backend-I
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment variables

Copy the template and fill in **your local** values:

```bash
cd backend-I
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
```

Then edit `.env`:

```
DATABASE_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/skillshare
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
FRONTEND_URL=
```

- `DATABASE_URL` — PostgreSQL connection string (local or Neon in production).
- `SECRET_KEY` — generate one:
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `FRONTEND_URL` — production frontend origin(s) for CORS, comma-separated.
  Leave empty for local development (localhost origins are always allowed).

> `.env` is git-ignored — never commit real credentials.

### 4. Database setup

Create a local database (e.g. in pgAdmin or psql):

```sql
CREATE DATABASE skillshare;
```

Tables are created automatically on first backend start
(`Base.metadata.create_all`). Idempotent startup migrations add any
columns the app needs. No manual SQL is required.

### 5. Run the FastAPI backend

```bash
cd backend-I
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 6. Run the frontend locally

Any static server works. From the project root:

```bash
cd "peer to peer skill share"
python -m http.server 5500 --bind 127.0.0.1
```

Then open <http://127.0.0.1:5500/login.html>.

(Windows convenience: run `start-skillshare.bat` to launch both servers.)

The frontend reads the backend URL from **one place**:
`peer to peer skill share/config.js` (`API_BASE_URL`). Update it there when
your backend URL changes — no need to edit every page.

### 7. Optional demo data (development only)

`backend-I/seed_demo.py` seeds throwaway demo users/requests/messages into
**whatever `DATABASE_URL` points at**. Only run it against a local database —
never against production.

```bash
python seed_demo.py
```

## API Documentation

With the backend running, interactive docs are available at:

- Swagger UI: <http://127.0.0.1:8000/docs>
- ReDoc: <http://127.0.0.1:8000/redoc>

Key endpoints: `/signup`, `/login`, `/me`, `/api/stats` (public),
`/api/dashboard`, `/api/users`, `/api/requests`, `/api/conversations`.

## Git Workflow

```bash
git checkout -b feature/my-feature
git add .
git commit -m "Describe your change"
git push -u origin feature/my-feature
# then open a Pull Request on GitHub
```

## Future Deployment Architecture (not yet deployed)

```
Frontend (static)  ->  Vercel
Backend (FastAPI)  ->  Render
PostgreSQL         ->  Neon
```

Deployment checklist (when ready):

1. **Render (backend)** — set env vars: `DATABASE_URL` (Neon connection
   string), `SECRET_KEY`, `FRONTEND_URL` (the Vercel URL), start command
   `uvicorn main:app --host 0.0.0.0 --port $PORT`.
2. **Neon (database)** — copy the pooled connection string into Render's
   `DATABASE_URL`.
3. **Vercel (frontend)** — update `API_BASE_URL` in
   `peer to peer skill share/config.js` to the Render backend URL.
