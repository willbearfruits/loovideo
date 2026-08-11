@echo off
REM loovideo gig launcher — output fullscreen on the external display, control
REM window left on the Ally's touchscreen.
REM
REM Rebuilds first so the shortcut can never launch stale code after an edit
REM (electron-vite build is ~2s). If the build fails it stops and shows why
REM rather than silently starting the previous version.
REM
REM Override the output display without editing this file:
REM     launch-loovideo.cmd 0        (0-based index into Electron's display list)

setlocal
cd /d "%~dp0"

set "DISPLAY_INDEX=%~1"
if "%DISPLAY_INDEX%"=="" set "DISPLAY_INDEX=1"

set "BUILD_LOG=%TEMP%\loovideo-build.log"
echo Building loovideo...
call npm run build >"%BUILD_LOG%" 2>&1
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Last lines of %BUILD_LOG%:
    echo.
    powershell -NoProfile -Command "Get-Content '%BUILD_LOG%' -Tail 25"
    echo.
    pause
    exit /b 1
)

echo Starting on display %DISPLAY_INDEX%...
start "" "%~dp0node_modules\electron\dist\electron.exe" . --fullscreen --display=%DISPLAY_INDEX%
exit /b 0
