@echo off
echo ===================================================
echo Starting Arka System (One Window)
echo ===================================================

echo.
echo Running backend and frontend together...
cd /d "%~dp0.."
npm run dev

pause
