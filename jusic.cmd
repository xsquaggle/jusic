@echo off
rem Double-click this to start jusic. It opens your browser automatically.
rem Leave this window open while you listen; close it (or press Ctrl+C) to stop.
title jusic
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is required but was not found.
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

node server.js %*
echo.
echo   jusic stopped.
pause
