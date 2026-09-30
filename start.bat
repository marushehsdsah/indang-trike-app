@echo off
rem Starts the whole IndangGO stack for local development on Windows:
rem   1. installs npm dependencies for the app and the backend (when missing or outdated)
rem   2. makes sure MongoDB is reachable on 127.0.0.1:27017 (starts a Docker container
rem      if needed, using Docker Desktop or the Docker engine inside WSL)
rem   3. runs the Express backend on port 3000 in a separate window
rem   4. runs the Expo dev server in this window
rem
rem Usage: start.bat [expo start options]
rem   start.bat             start everything
rem   start.bat --android   also open the app on an Android emulator/device
rem   start.bat --clear     clear the Metro bundler cache
rem
rem To stop: press Ctrl+C, then answer N to "Terminate batch job (Y/N)?" so the
rem backend and MongoDB are shut down too.
rem
rem start.sh is the equivalent for WSL, macOS and Linux.

setlocal EnableExtensions DisableDelayedExpansion

rem ORIGIN is the project folder as Windows sees it, e.g. \\wsl.localhost\Ubuntu\home\you\indang-trike-app
rem when the project lives inside WSL. WSL_DISTRO is set only in that case.
set "ORIGIN=%~dp0"
set "ORIGIN=%ORIGIN:~0,-1%"
set "WSL_DISTRO="
if /i "%ORIGIN:~0,5%"=="\\wsl" for /f "tokens=2 delims=\" %%d in ("%ORIGIN%") do set "WSL_DISTRO=%%d"

rem pushd (unlike cd) also works on a \\wsl... share: it maps it to a temporary drive letter.
pushd "%ORIGIN%" || exit /b 1

set "ROOT=%CD%"
set "BACKEND_DIR=%ROOT%\indang-trike-backend"
rem BACKEND_PORT must match PORT in server.js.
set "BACKEND_PORT=3000"
set "MONGO_PORT=27017"
set "MONGO_CONTAINER=indang-trike-mongo"
set "MONGO_IMAGE=mongo:8"
set "DOCKER="
set "STARTED_BACKEND=0"
set "STARTED_MONGO=0"

rem --- 1. Dependencies -------------------------------------------------------

where node >nul 2>&1 || (echo [start] Node.js is not installed ^(https://nodejs.org^). & goto :fail)
where npm >nul 2>&1 || (echo [start] npm is not installed. & goto :fail)

call :install_deps "%ORIGIN%" app || goto :fail
call :install_deps "%ORIGIN%\indang-trike-backend" backend || goto :fail

rem --- 2. MongoDB ------------------------------------------------------------

call :port_open %MONGO_PORT% && (
  echo [start] MongoDB is already running on port %MONGO_PORT%.
  goto :backend
)

docker info >nul 2>&1 && set "DOCKER=docker"
if not defined DOCKER (wsl --cd ~ -e docker info >nul 2>&1 && set "DOCKER=wsl --cd ~ -e docker")
if not defined DOCKER (
  echo [start] MongoDB is not running on port %MONGO_PORT% and Docker is not available.
  echo [start] The backend will start, but register/login will fail until MongoDB is running.
  goto :backend
)

%DOCKER% container inspect %MONGO_CONTAINER% >nul 2>&1
if errorlevel 1 (
  echo [start] Creating MongoDB container '%MONGO_CONTAINER%' ^(the first run downloads %MONGO_IMAGE%^)...
  %DOCKER% run -d --name %MONGO_CONTAINER% -p 127.0.0.1:%MONGO_PORT%:27017 -v indang-trike-mongo-data:/data/db %MONGO_IMAGE% >nul || (
    echo [start] Could not create the MongoDB container.
    goto :fail
  )
) else (
  echo [start] Starting MongoDB container '%MONGO_CONTAINER%'...
  %DOCKER% start %MONGO_CONTAINER% >nul || (
    echo [start] Could not start the MongoDB container.
    goto :fail
  )
)
set "STARTED_MONGO=1"

for /l %%i in (1,1,30) do (
  %DOCKER% exec %MONGO_CONTAINER% mongosh --quiet --eval "db.runCommand({ ping: 1 })" >nul 2>&1 && goto :mongo_ready
  ping -n 2 127.0.0.1 >nul
)
echo [start] MongoDB did not become ready in 30s ^(check: %DOCKER% logs %MONGO_CONTAINER%^).
goto :fail

:mongo_ready
echo [start] MongoDB is ready on port %MONGO_PORT%.

rem --- 3. Backend ------------------------------------------------------------

:backend
rem server.js currently lives in the repo root while its dependencies are installed
rem in indang-trike-backend\, so NODE_PATH points Node's module lookup there. If
rem server.js is moved into indang-trike-backend\, it is picked up from there.
set "BACKEND_ENTRY=%ROOT%\server.js"
if exist "%BACKEND_DIR%\server.js" set "BACKEND_ENTRY=%BACKEND_DIR%\server.js"

call :port_open %BACKEND_PORT% && (
  echo [start] Port %BACKEND_PORT% is already in use; assuming the backend is already running.
  goto :app
)

echo [start] Starting backend on port %BACKEND_PORT% in a new window...
set "NODE_PATH=%BACKEND_DIR%\node_modules"
rem "|| pause" keeps the window open to show the error if the backend crashes.
start "IndangGO backend" cmd /c node "%BACKEND_ENTRY%" ^|^| pause
set "NODE_PATH="
set "STARTED_BACKEND=1"

for /l %%i in (1,1,20) do (
  call :port_open %BACKEND_PORT% && goto :app
  ping -n 2 127.0.0.1 >nul
)
echo [start] The backend is not listening on port %BACKEND_PORT% ^(see the "IndangGO backend" window^).
goto :fail

rem --- 4. App ----------------------------------------------------------------

:app
echo [start] Starting Expo...
rem Runs the Expo CLI directly rather than through npx.cmd, so Ctrl+C only asks
rem "Terminate batch job?" once.
node "%ROOT%\node_modules\expo\bin\cli" start %*

call :cleanup
popd
exit /b 0

:fail
call :cleanup
popd
exit /b 1

rem --- Subroutines -----------------------------------------------------------

:cleanup
if "%STARTED_BACKEND%"=="1" (
  echo [start] Stopping backend...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr /c:"0.0.0.0:%BACKEND_PORT% "') do taskkill /pid %%p /t /f >nul 2>&1
)
if "%STARTED_MONGO%"=="1" (
  echo [start] Stopping MongoDB container...
  %DOCKER% stop %MONGO_CONTAINER% >nul
)
exit /b 0

rem Exits 0 when something is listening on 127.0.0.1:<port>.
:port_open
node -e "require('net').connect(%~1, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"
exit /b

rem Runs "npm ci" in <dir> when node_modules is missing, older than package-lock.json
rem (e.g. after pulling a teammate's new dependency), or was installed by npm on
rem WSL/macOS/Linux: that npm writes no .cmd shims into node_modules\.bin, and its
rem native binaries can't run on Windows. Windows can't delete the Linux symlinks
rem in such a node_modules on a \\wsl... share, so WSL removes it first.
:install_deps
node -e "const fs = require('fs'), path = require('path'), nm = path.join(process.argv[1], 'node_modules'), stamp = path.join(nm, '.package-lock.json'), bin = path.join(nm, '.bin'); if (fs.existsSync(bin) && !fs.readdirSync(bin).some((f) => f.endsWith('.cmd'))) process.exit(2); process.exit(!fs.existsSync(stamp) || fs.statSync(path.join(process.argv[1], 'package-lock.json')).mtimeMs > fs.statSync(stamp).mtimeMs ? 1 : 0);" "%~1"
set "DEPS_STATE=%errorlevel%"
if "%DEPS_STATE%"=="0" exit /b 0
if "%DEPS_STATE%"=="2" (
  echo [start] The %~2 node_modules was installed by npm on WSL/macOS/Linux and cannot run on Windows; reinstalling.
  if defined WSL_DISTRO wsl -d %WSL_DISTRO% --cd "%~1" -e rm -rf node_modules
)
echo [start] Installing %~2 dependencies...
pushd "%~1"
call npm ci
set "NPM_EXIT=%errorlevel%"
popd
if not "%NPM_EXIT%"=="0" (
  echo [start] npm ci failed for the %~2.
  exit /b 1
)
exit /b 0
