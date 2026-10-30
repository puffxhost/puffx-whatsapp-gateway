@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo Docker was not found. Install Docker Desktop, start it, then run this file again.
  echo https://docs.docker.com/desktop/setup/install/windows-install/
  pause
  exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is installed but is not running. Start Docker Desktop and try again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  if errorlevel 1 (
    echo Could not create .env from .env.example.
    pause
    exit /b 1
  )
  echo Set unique values for POSTGRES_PASSWORD, SESSION_SECRET, and API_KEY_PEPPER.
  echo Save and close Notepad to continue.
  notepad ".env"
)

findstr /L /C:"POSTGRES_PASSWORD=replace-with-a-strong-database-password" /C:"SESSION_SECRET=replace-with-at-least-32-random-bytes" /C:"API_KEY_PEPPER=replace-with-a-different-random-secret" ".env" >nul
if not errorlevel 1 (
  echo Replace the sample secrets in .env. Save and close Notepad to continue.
  notepad ".env"
  findstr /L /C:"POSTGRES_PASSWORD=replace-with-a-strong-database-password" /C:"SESSION_SECRET=replace-with-at-least-32-random-bytes" /C:"API_KEY_PEPPER=replace-with-a-different-random-secret" ".env" >nul
)
if not errorlevel 1 (
  echo Sample secrets remain in .env. Edit the file and run setup-windows.cmd again.
  pause
  exit /b 1
)

docker compose up -d --build
if errorlevel 1 (
  echo Setup failed. Check the Docker Desktop status and try: docker compose logs gateway
  pause
  exit /b 1
)

echo.
echo Puffx WhatsApp Gateway is starting at http://127.0.0.1:3000
start "" "http://127.0.0.1:3000"
echo To stop it later, run: docker compose down
pause

