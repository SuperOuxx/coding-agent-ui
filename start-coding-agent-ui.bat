@echo off
setlocal

set "APP_DIR=D:\project\ai\coding-agent-ui"
set "LOG_FILE=D:\logs\coding-agent-ui.log"
set "PORT=3001"

if not exist "D:\logs" mkdir "D:\logs"

cd /d "%APP_DIR%" || exit /b 1

echo.>> "%LOG_FILE%"
echo ===== [%date% %time%] start-coding-agent-ui =====>> "%LOG_FILE%"
echo APP_DIR=%APP_DIR% PORT=%PORT%>> "%LOG_FILE%"

call npm.cmd run build >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  echo [ERROR] Build failed.>> "%LOG_FILE%"
  exit /b 1
)

call ccui start >> "%LOG_FILE%" 2>&1