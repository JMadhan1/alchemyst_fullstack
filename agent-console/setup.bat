@echo off
echo ============================================================
echo  Agent Console - Setup ^& Run
echo ============================================================
echo.

echo [1/4] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  exit /b 1
)

echo.
echo [2/4] Running unit tests...
call npm test
if %errorlevel% neq 0 (
  echo WARNING: Some tests failed - check output above
)

echo.
echo [3/4] Building production bundle...
call npm run build
if %errorlevel% neq 0 (
  echo ERROR: Build failed - check TypeScript errors above
  exit /b 1
)

echo.
echo [4/4] SUCCESS! Start the app with:
echo   npm run dev        (development - recommended)
echo   npm run start      (production)
echo.
echo Then open http://localhost:3000
echo.
echo To run against the agent server:
echo   docker build -t agent-server ./agent-server
echo   docker run -p 4747:4747 agent-server
echo   docker run -p 4747:4747 agent-server --mode chaos
echo ============================================================
