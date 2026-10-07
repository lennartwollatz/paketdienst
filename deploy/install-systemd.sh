#!/usr/bin/env bash
# systemd-Units für Paketdienst neu installieren (aus deploy/ nach /etc/systemd/system/).
# Auf dem Server: chmod +x deploy/install-systemd.sh && DEPLOY_SUDO=1 ./deploy/install-systemd.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=deploy/server.defaults.sh
source "$SCRIPT_DIR/server.defaults.sh"
APP_DIR="${APP_DIR:-$APP}"
RUN_USER="${RUN_USER:-$USER}"

SUDO=""
if [[ "${DEPLOY_SUDO:-}" == "1" ]]; then
  SUDO="sudo "
elif [[ "$(id -u)" -ne 0 ]]; then
  echo "Hinweis: ohne root — setze DEPLOY_SUDO=1 oder starte mit sudo." >&2
  SUDO="sudo "
fi

log() { printf '\033[1;34m=>\033[0m %s\n' "$*"; }

log "Stoppe alte Dienste (falls vorhanden)"
${SUDO}systemctl stop paketdienst-api paketdienst-web 2>/dev/null || true
pm2 delete paketdienst 2>/dev/null || true
pm2 delete paketdienst-backend 2>/dev/null || true

log "Kopiere Units nach /etc/systemd/system/"
${SUDO}cp "$REPO_ROOT/deploy/paketdienst-api.service" /etc/systemd/system/
${SUDO}cp "$REPO_ROOT/deploy/paketdienst-web.service" /etc/systemd/system/
${SUDO}cp "$REPO_ROOT/deploy/paketdienst.target" /etc/systemd/system/

log "Pfade und User setzen (APP=$APP_DIR, USER=$RUN_USER)"
${SUDO}sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR/backend|" /etc/systemd/system/paketdienst-api.service
${SUDO}sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/paketdienst-web.service
${SUDO}sed -i "s|^Environment=FRONTEND_DIST=.*|Environment=FRONTEND_DIST=$APP_DIR/frontend/dist|" /etc/systemd/system/paketdienst-web.service
${SUDO}sed -i "s|^EnvironmentFile=.*|EnvironmentFile=-$APP_DIR/backend/.env|" /etc/systemd/system/paketdienst-api.service
${SUDO}sed -i "s|^User=.*|User=$RUN_USER|" /etc/systemd/system/paketdienst-api.service
${SUDO}sed -i "s|^Group=.*|Group=$RUN_USER|" /etc/systemd/system/paketdienst-api.service
${SUDO}sed -i "s|^User=.*|User=$RUN_USER|" /etc/systemd/system/paketdienst-web.service
${SUDO}sed -i "s|^Group=.*|Group=$RUN_USER|" /etc/systemd/system/paketdienst-web.service

NODE_PATH="$(command -v node || true)"
if [[ -n "$NODE_PATH" && "$NODE_PATH" != "/usr/bin/env node" ]]; then
  log "ExecStart → $NODE_PATH"
  ${SUDO}sed -i "s|^ExecStart=.*|ExecStart=$NODE_PATH dist/index.js|" /etc/systemd/system/paketdienst-api.service
  ${SUDO}sed -i "s|^ExecStart=.*|ExecStart=$NODE_PATH deploy/static-server.js|" /etc/systemd/system/paketdienst-web.service
fi

log "daemon-reload, enable, start"
${SUDO}systemctl daemon-reload
${SUDO}systemctl enable paketdienst-api paketdienst-web paketdienst.target
${SUDO}systemctl start paketdienst.target

log "Status:"
${SUDO}systemctl status paketdienst-api paketdienst-web --no-pager || true

printf '\nTest:\n  curl -s http://127.0.0.1:3001/api/health\n'
printf '  curl -s -o /dev/null -w "%%{http_code}\\n" http://127.0.0.1:3002/paketdienst/\n'
