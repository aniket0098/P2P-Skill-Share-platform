@echo off
REM =========================================================
REM  SKILLSHARE - START EVERYTHING (PostgreSQL must be running)
REM  1. FastAPI backend  -> http://127.0.0.1:8000
REM  2. Frontend website -> http://127.0.0.1:5500
REM
REM  v2 (Stage 8 fix): the browser and the "LIVE" message only
REM  appear AFTER the backend has answered a health request and
REM  the frontend is serving login.html. No more "Server
REM  unavailable" right after starting.
REM =========================================================
title SkillShare - Local Server Launcher
setlocal

set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONT_URL=http://127.0.0.1:5500"
set "BACK_PATH=%~dp0backend-I"
set "FRONT_PATH=%~dp0peer to peer skill share"

echo.
echo [1/4] Checking backend at %BACKEND_URL% ...

curl -s -o nul --max-time 3 %BACKEND_URL%/api/stats
if not errorlevel 1 (
  echo       Backend already online - reusing it.
  goto frontend
)

echo       Backend not answering yet.
netstat -ano 2>nul | findstr /R ":8000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo       WARNING: a process is already listening on port 8000 but is not
  echo       responding. If it is an old server, close its black window and
  echo       run this launcher again. Continuing anyway...
)

echo       Starting FastAPI backend (first start can take 10-60s) ...
cd /d "%BACK_PATH%"
start "SkillShare Backend (uvicorn)" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo.
echo [2/4] Waiting for the backend to come online ...
set tries=0
:wait_backend
ping -n 3 127.0.0.1 >nul
set /a tries+=1
curl -s -o nul --max-time 3 %BACKEND_URL%/api/stats
if not errorlevel 1 goto backend_up
if %tries% GEQ 30 (
  echo       Backend still not answering after ~60s. Check the backend
  echo       window for errors, then re-run this launcher.
  goto backend_up
)
goto wait_backend

:backend_up
echo       Backend online: %BACKEND_URL%/docs

:frontend
echo.
echo [3/4] Checking frontend at %FRONT_URL% ...
curl -s -o nul --max-time 3 %FRONT_URL%/login.html
if not errorlevel 1 (
  echo       Frontend already online - reusing it.
  goto open
)

cd /d "%FRONT_PATH%"
start "SkillShare Frontend (http.server)" cmd /k "python -m http.server 5500 --bind 127.0.0.1"

set tries=0
:wait_front
ping -n 2 127.0.0.1 >nul
set /a tries+=1
curl -s -o nul --max-time 3 %FRONT_URL%/login.html
if not errorlevel 1 goto front_up
if %tries% GEQ 15 goto front_up
goto wait_front

:front_up
echo       Frontend online: %FRONT_URL%/login.html

:open
echo.
echo [4/4] Final check before opening the browser ...
set tries=0
:verify_api
curl -s -o nul --max-time 3 %BACKEND_URL%/api/stats
if not errorlevel 1 goto open_browser
set /a tries+=1
if %tries% GEQ 20 goto open_browser
ping -n 2 127.0.0.1 >nul
goto verify_api

:open_browser
start "" "%FRONT_URL%/login.html"

echo.
echo =========================================================
echo  SkillShare is LIVE!
echo    Website : %FRONT_URL%/login.html
echo    Backend : %BACKEND_URL%/docs
echo =========================================================
echo.
echo (Keep the two black server windows open while you use the
echo  site. Close them to stop the servers.)
pause
endlocal