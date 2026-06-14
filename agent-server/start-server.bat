@echo off
echo ============================================================
echo  Alchemyst Agent Server
echo ============================================================
echo.

echo [1/2] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)

echo.
echo [2/2] Starting server...
echo.
echo   Normal mode : npm run dev
echo   Chaos mode  : npm run dev:chaos
echo.
echo Starting in NORMAL mode...
echo Server will be at ws://localhost:4747/ws
echo Logs at        http://localhost:4747/log
echo Health at      http://localhost:4747/health
echo.
call npm run dev
