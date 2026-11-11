@echo off
cd /d "%~dp0"
python run-local.py
if errorlevel 1 pause
