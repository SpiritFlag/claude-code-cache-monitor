@echo off
rem cc-monitor: live Claude Code cache/context cockpit
rem usage: start-monitor.cmd [projectsDir] [port]
set DIR=%~1
set PORT=%~2
if "%DIR%"=="" set DIR=%USERPROFILE%\.claude\projects
if "%PORT%"=="" set PORT=7777
start "" http://localhost:%PORT%
node "%~dp0server.js" --dir "%DIR%" --port %PORT%
