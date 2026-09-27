@echo off
cd /d "%~dp0"
echo.
echo AI-WasteTwin is starting locally...
echo Open http://localhost:8000 in your browser.
echo Press Ctrl+C to stop the server.
echo.
start "" http://localhost:8000
where py >nul 2>nul
if %errorlevel%==0 (
  py -m http.server 8000
) else (
  python -m http.server 8000
)
pause
