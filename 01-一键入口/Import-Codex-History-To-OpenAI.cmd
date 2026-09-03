@echo off
setlocal EnableExtensions
title Import Codex History To OpenAI

echo.
echo Run this file from inside a Codex-History-Export folder.
echo It will close Codex and Codex++, back up target history, then merge imported history as openai.
choice /C YN /N /M "Continue"
if errorlevel 2 exit /b 0

taskkill /IM codex.exe /T /F >nul 2>&1
taskkill /IM codex-code-mode-host.exe /T /F >nul 2>&1
taskkill /IM codex-plus-plus.exe /T /F >nul 2>&1
taskkill /IM codex-plus-plus-manager.exe /T /F >nul 2>&1
timeout /T 2 /NOBREAK >nul

call :find_node
if not defined NODE (
  echo ERROR: No compatible Node.js runtime was found.
  pause
  exit /b 1
)

"%NODE%" "%~dp0..\02-脚本实现\import-codex-history-to-openai.js"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if defined NODE "%NODE%" -e "require('node:sqlite')" >nul 2>&1 || set "NODE="
if defined NODE exit /b 0
for /R "%LOCALAPPDATA%\OpenAI\Codex\runtimes" %%F in (node.exe) do (
  "%%F" -e "require('node:sqlite')" >nul 2>&1 && set "NODE=%%F"
  if defined NODE exit /b 0
)
exit /b 0
