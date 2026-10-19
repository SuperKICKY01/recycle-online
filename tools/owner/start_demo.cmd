@echo off
rem Double-click this file in Explorer (tools\owner\start_demo.cmd) to open the demo:
rem the demo database, the server, the emulator with the phone app, and the desktop program.
rem It runs start_demo.ps1 next to it; stop everything with stop_demo.cmd.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_demo.ps1" %*
echo.
pause
