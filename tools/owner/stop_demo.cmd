@echo off
rem Double-click this file in Explorer (tools\owner\stop_demo.cmd) to stop exactly what
rem start_demo.cmd started. It runs stop_demo.ps1 next to it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_demo.ps1"
echo.
pause
