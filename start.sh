#!/usr/bin/env bash
#
# Starts the whole IndangGO stack for local development:
#   1. installs npm dependencies for the app and the backend (when missing or outdated)
#   2. makes sure MongoDB is reachable on 127.0.0.1:27017 (starts a Docker container if needed)
#   3. runs the Express backend on port 3000 in the background
#   4. runs the Expo dev server in the foreground
#
# Usage: ./start.sh [expo start options]
#   ./start.sh             # start everything
#   ./start.sh --tunnel    # expose Metro (not the backend) when your phone can't reach it; see docs/wsl-phone-networking.md
#   ./start.sh --android   # also open the app on an Android emulator/device
#   ./start.sh --clear     # clear the Metro bundler cache
#
# Press Ctrl+C to stop everything.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

ROOT="$PWD"
BACKEND_DIR="$ROOT/indang-trike-backend"
BACKEND_PORT=3000 # must match PORT in server.js
MONGO_PORT=27017
MONGO_CONTAINER="indang-trike-mongo"
MONGO_IMAGE="mongo:8"

BACKEND_PID=""
STARTED_MONGO=0

log()  { printf '\033[1;32m[start]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[start]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[start]\033[0m %s\n' "$*" >&2; exit 1; }

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

cleanup() {
  trap - EXIT INT TERM HUP
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "Stopping backend..."
    kill "$BACKEND_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
  fi
  if (( STARTED_MONGO )); then
    log "Stopping MongoDB container..."
    docker stop "$MONGO_CONTAINER" >/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# --- 1. Dependencies ---------------------------------------------------------

command -v node >/dev/null || die "Node.js is not installed (https://nodejs.org)."
command -v npm  >/dev/null || die "npm is not installed."

NODE_PLATFORM="$(node -p process.platform)"

# Windows npm writes .cmd shims into node_modules/.bin. A node_modules installed
# that way (e.g. from PowerShell against this WSL checkout) has Windows-only
# native binaries and non-executable shims, so it can't run here.
installed_by_windows() { compgen -G "$1/node_modules/.bin/*.cmd" >/dev/null; }

# Runs `npm ci` when node_modules is missing, older than package-lock.json
# (e.g. after pulling a teammate's new dependency), or installed by Windows npm.
install_deps() {
  local dir=$1 name=$2 stamp="$1/node_modules/.package-lock.json"
  if [[ "$NODE_PLATFORM" != win32 ]] && installed_by_windows "$dir"; then
    warn "The $name's node_modules was installed by Windows npm and can't run here; reinstalling."
  elif [[ -f "$stamp" && ! "$dir/package-lock.json" -nt "$stamp" ]]; then
    return 0
  fi
  log "Installing $name dependencies..."
  (cd "$dir" && npm ci) || die "npm ci failed for the $name."
}
install_deps "$ROOT" "app"
install_deps "$BACKEND_DIR" "backend"

# --- 2. MongoDB --------------------------------------------------------------

if port_open "$MONGO_PORT"; then
  log "MongoDB is already running on port $MONGO_PORT."
elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  if docker container inspect "$MONGO_CONTAINER" >/dev/null 2>&1; then
    log "Starting MongoDB container '$MONGO_CONTAINER'..."
    docker start "$MONGO_CONTAINER" >/dev/null || die "Could not start the MongoDB container."
  else
    log "Creating MongoDB container '$MONGO_CONTAINER' (the first run downloads $MONGO_IMAGE)..."
    docker run -d --name "$MONGO_CONTAINER" \
      -p "127.0.0.1:$MONGO_PORT:27017" \
      -v indang-trike-mongo-data:/data/db \
      "$MONGO_IMAGE" >/dev/null || die "Could not create the MongoDB container."
  fi
  STARTED_MONGO=1

  mongo_ready=0
  for _ in {1..30}; do
    if docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.runCommand({ ping: 1 })' >/dev/null 2>&1; then
      mongo_ready=1
      break
    fi
    sleep 1
  done
  (( mongo_ready )) || die "MongoDB did not become ready in 30s (check: docker logs $MONGO_CONTAINER)."
  log "MongoDB is ready on port $MONGO_PORT."
else
  warn "MongoDB is not running on port $MONGO_PORT and Docker is not available."
  warn "The backend will start, but register/login will fail until MongoDB is running."
fi

# --- 3. Backend --------------------------------------------------------------

# server.js currently lives in the repo root while its dependencies are installed
# in indang-trike-backend/, so NODE_PATH points Node's module lookup there. If
# server.js is moved into indang-trike-backend/, it is picked up from there.
if [[ -f "$BACKEND_DIR/server.js" ]]; then
  BACKEND_ENTRY="$BACKEND_DIR/server.js"
else
  BACKEND_ENTRY="$ROOT/server.js"
fi

if port_open "$BACKEND_PORT"; then
  warn "Port $BACKEND_PORT is already in use; assuming the backend is already running."
else
  log "Starting backend on port $BACKEND_PORT..."
  NODE_PATH="$BACKEND_DIR/node_modules" node "$BACKEND_ENTRY" \
    > >(awk '{ print "\033[1;36m[backend]\033[0m " $0; fflush() }') 2>&1 &
  BACKEND_PID=$!
  for _ in {1..20}; do
    port_open "$BACKEND_PORT" && break
    kill -0 "$BACKEND_PID" 2>/dev/null || die "The backend exited during startup (see the [backend] output above)."
    sleep 0.5
  done
fi

# --- 4. App ------------------------------------------------------------------

# The app on a phone loads from the address in the QR code, and the app derives the
# backend URL from that same host (utils/registration.js). Under WSL's default NAT
# networking that address is WSL-internal (172.x), so phones cannot load the app;
# mirrored networking puts WSL on the PC's LAN address.
host_flag_given() {
  local arg
  for arg in "$@"; do
    case "$arg" in --tunnel|--lan|--localhost|--host|--host=*|-m) return 0 ;; esac
  done
  return 1
}

if grep -qi microsoft /proc/version 2>/dev/null && ! host_flag_given "$@"; then
  if [[ "$(wslinfo --networking-mode 2>/dev/null)" == mirrored ]]; then
    # Pin the address of the adapter with the default route, so Expo doesn't pick
    # a virtual (Hyper-V, Docker, VPN) adapter that phones can't reach.
    if [[ -z "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
      lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit } }')"
      [[ -n "$lan_ip" ]] && export REACT_NATIVE_PACKAGER_HOSTNAME="$lan_ip"
    fi
    if [[ -n "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]]; then
      log "Phones will load the app from $REACT_NATIVE_PACKAGER_HOSTNAME (override with REACT_NATIVE_PACKAGER_HOSTNAME=<ip>)."
    fi
    log "If a phone cannot load the app, allow the ports through the WSL firewall (see docs/wsl-phone-networking.md)."
  else
    warn "WSL is using NAT networking: phones can't reach Metro or the backend at this WSL-internal address,"
    warn "so the app on a phone cannot load (the Windows Android emulator still works)."
    warn "Enable mirrored networking (see docs/wsl-phone-networking.md), or use ./start.sh --tunnel for UI-only testing."
  fi
fi

# Expo's Android shortcut ("a" / --android) runs $ANDROID_HOME/platform-tools/adb
# and $ANDROID_HOME/emulator/emulator. Inside WSL the SDK is normally only
# installed on Windows, so point ANDROID_HOME at a folder of links to its .exe
# files, which WSL can run directly.
windows_android_sdk() {
  local vars sdk
  vars="$(cd /mnt/c 2>/dev/null && cmd.exe /d /c 'echo %ANDROID_HOME%^|%LOCALAPPDATA%' 2>/dev/null | tr -d '\r')" || return 1
  for sdk in "${vars%%|*}" "${vars#*|}\\Android\\Sdk"; do
    [[ "$sdk" == %* ]] && continue
    sdk="$(wslpath -u "$sdk" 2>/dev/null)" || continue
    [[ -f "$sdk/platform-tools/adb.exe" ]] && { printf '%s\n' "$sdk"; return 0; }
  done
  return 1
}

if grep -qi microsoft /proc/version 2>/dev/null && [[ -z "${ANDROID_HOME:-}" && ! -d "$HOME/Android/Sdk" ]]; then
  if win_sdk="$(windows_android_sdk)"; then
    shim="$ROOT/.expo/wsl-android-sdk"
    mkdir -p "$shim/platform-tools" "$shim/emulator"
    ln -sfn "$win_sdk/platform-tools/adb.exe" "$shim/platform-tools/adb"
    # Expo splits `emulator -list-avds` on "\n", so the CRLF output of the .exe
    # would leave "\r" on every AVD name and break launching one.
    rm -f "$shim/emulator/emulator"
    printf '#!/usr/bin/env bash\n# Generated by start.sh.\nexe=%q\nif [[ "$1" == -list-avds ]]; then\n  set -o pipefail\n  "$exe" "$@" | tr -d "\\r"\nelse\n  exec "$exe" "$@"\nfi\n' \
      "$win_sdk/emulator/emulator.exe" > "$shim/emulator/emulator"
    chmod +x "$shim/emulator/emulator"
    export ANDROID_HOME="$shim"
    log "Using the Windows Android SDK for emulator/device commands: $win_sdk"
  fi
fi

log "Starting Expo..."
npx expo start "$@"
