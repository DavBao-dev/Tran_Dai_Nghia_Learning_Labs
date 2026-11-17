@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 start-jupyterlab.py
) else (
  python start-jupyterlab.py
)
pause
