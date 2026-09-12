@echo off
setlocal EnableExtensions
title Backup Codex Target Before Merge

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\02-scripts\Backup-Codex-Target-Before-Merge.ps1"
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo Backup completed and verified. Reopen Codex and continue the merge task.
) else (
  echo Backup did not complete successfully. No source files were deleted.
)
echo.
pause
exit /b %RESULT%
