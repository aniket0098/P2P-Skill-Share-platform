
@echo off
REM =========================================================
REM  SKILLSHARE - START EVERYTHING (PostgreSQL must be running)
REM  1. FastAPI backend  -> http://127.0.0.1:8000
REM  2. Frontend website -> http://127.0.0.1:5500
REM =========================================================

title SkillShare - Local Server Launcher

echo.
echo [1/3] Starting FastAPI backend on http://127.0.0.1:8000 ...
cd /d "%~dp0backend-I"
start "SkillShare Backend (uvicorn)" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo [2/3] Starting frontend website on http://127.0.0.1:5500 ...
cd /d "%~dp0peer to peer skill share"
start "SkillShare Frontend (http.server)" cmd /k "python -m http.server 5500 --bind 127.0.0.1"

echo [3/3] Opening the website in your browser ...
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5500/login.html"

echo.
echo =========================================================
echo  SkillShare is LIVE!
echo    Website : http://127.0.0.1:5500/login.html
echo    Backend : http://127.0.0.1:8000/docs
echo.
echo  Log in with your own registered account
echo  (create one on signup.html if needed).
echo =========================================================
echo.
echo (Keep the two black server windows open while you use the
echo  site. Close them to stop the servers.)
pause

