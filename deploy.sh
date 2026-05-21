#!/usr/bin/env bash
#
# Produktions-Deployment für Paketdienst.
# Auf dem Server ausführen (nach git push von lokal):
#   chmod +x deploy.sh
#   ./deploy.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/deploy.config"

SKIP_PULL=false
SKIP_FRONTEND=false
SKIP_BACKEND=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Verwendung: ./deploy.sh [Optionen]

Führt ein sicheres Produktions-Deployment durch:
  git pull → DB-Backup → prisma migrate deploy → Backend-Build → Frontend-Build → Neustart

Optionen:
  --skip-pull       Kein git pull (Code bereits aktuell)
  --skip-frontend   Nur Backend deployen
  --skip-backend    Nur Frontend deployen
  --dry-run         Zeigt geplante Schritte, führt nichts aus
  -h, --help        Diese Hilfe

Voraussetzungen:
  - deploy.config (siehe deploy.config.example)
  - backend/.env mit DATABASE_URL, JWT_SECRET, …
  - frontend/.env mit VITE_* für Produktion
EOF
}

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == true ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)     SKIP_PULL=true ;;
    --skip-frontend) SKIP_FRONTEND=true ;;
    --skip-backend)  SKIP_BACKEND=true ;;
    --dry-run)       DRY_RUN=true ;;
    -h|--help)       usage; exit 0 ;;
    *) die "Unbekannte Option: $1 (./deploy.sh --help)" ;;
  esac
  shift
done

[[ -f "$CONFIG_FILE" ]] || die "deploy.config fehlt. Kopiere deploy.config.example nach deploy.config und passe Werte an."

# shellcheck source=/dev/null
source "$CONFIG_FILE"

: "${REPO_DIR:?REPO_DIR in deploy.config setzen}"
: "${FRONTEND_DEPLOY_DIR:?FRONTEND_DEPLOY_DIR in deploy.config setzen}"
: "${BACKEND_RESTART_MODE:=none}"
: "${BACKEND_SERVICE_NAME:=paketdienst-backend}"
: "${PM2_APP_NAME:=paketdienst}"
: "${GIT_BRANCH:=main}"
: "${BACKUP_DIR:=${REPO_DIR}/backups}"
: "${KEEP_BACKUPS:=5}"

BACKEND_DIR="${REPO_DIR}/backend"
FRONTEND_DIR="${REPO_DIR}/frontend"
BACKEND_ENV="${BACKEND_DIR}/.env"
FRONTEND_ENV="${FRONTEND_DIR}/.env"

command -v git >/dev/null  2>&1 || die "git nicht gefunden"
command -v npm >/dev/null  2>&1 || die "npm nicht gefunden"
command -v node >/dev/null 2>&1 || die "node nicht gefunden"

[[ -d "$REPO_DIR" ]]        || die "REPO_DIR existiert nicht: $REPO_DIR"
[[ -f "$BACKEND_ENV" ]]     || die "backend/.env fehlt auf dem Server"
[[ "$SKIP_FRONTEND" == false && -f "$FRONTEND_ENV" ]] || [[ "$SKIP_FRONTEND" == true ]] \
  || die "frontend/.env fehlt — VITE_*-Variablen werden beim Build benötigt"

resolve_db_path() {
  local url raw path
  url="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$BACKEND_ENV" | tail -n1 | cut -d= -f2- | tr -d ' "'\''')"
  [[ -n "$url" ]] || die "DATABASE_URL nicht in backend/.env gefunden"

  if [[ "$url" =~ ^file:(.+)$ ]]; then
    raw="${BASH_REMATCH[1]}"
    if [[ "$raw" == ./* ]]; then
      path="${BACKEND_DIR}/${raw#./}"
    elif [[ "$raw" == /* ]]; then
      path="$raw"
    else
      path="${BACKEND_DIR}/${raw}"
    fi
    printf '%s\n' "$path"
  else
    die "Nur SQLite file:-URLs werden unterstützt (aktuell: $url)"
  fi
}

backup_database() {
  local db_path backup_file
  db_path="$(resolve_db_path)"

  if [[ ! -f "$db_path" ]]; then
    warn "Datenbankdatei noch nicht vorhanden ($db_path) — überspringe Backup (Erstinstallation?)"
    return 0
  fi

  run mkdir -p "$BACKUP_DIR"
  backup_file="${BACKUP_DIR}/$(basename "$db_path").$(date +%Y%m%d-%H%M%S).bak"
  log "Datenbank sichern → $backup_file"
  run cp "$db_path" "$backup_file"

  if [[ "$DRY_RUN" == false && -f "${db_path}-journal" ]]; then
    run cp "${db_path}-journal" "${backup_file}-journal" || true
  fi

  ok "Backup erstellt"

  if [[ "$DRY_RUN" == false && "$KEEP_BACKUPS" -gt 0 ]]; then
    mapfile -t old_backups < <(ls -1t "${BACKUP_DIR}/$(basename "$db_path")."*.bak 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) || true)
    for old in "${old_backups[@]:-}"; do
      [[ -n "$old" ]] || continue
      rm -f "$old" "${old}-journal"
    done
  fi
}

run_migrations() {
  log "Prisma Client generieren und Migrationen anwenden (bestehende Daten bleiben erhalten)"
  run bash -c "cd '$BACKEND_DIR' && npm run db:generate"
  run bash -c "cd '$BACKEND_DIR' && npm run db:deploy"
  ok "Migrationen angewendet"
}

build_backend() {
  log "Backend bauen"
  run bash -c "cd '$BACKEND_DIR' && npm ci"
  run_migrations
  run bash -c "cd '$BACKEND_DIR' && npm run build"
  ok "Backend gebaut"
}

restart_backend() {
  case "$BACKEND_RESTART_MODE" in
    systemd)
      log "Backend neu starten (systemd: $BACKEND_SERVICE_NAME)"
      run sudo systemctl restart "$BACKEND_SERVICE_NAME"
      run sudo systemctl is-active --quiet "$BACKEND_SERVICE_NAME"
      ok "Backend-Dienst läuft"
      ;;
    pm2)
      log "Backend neu starten (pm2: $PM2_APP_NAME)"
      run pm2 restart "$PM2_APP_NAME"
      ok "PM2-Prozess neu gestartet"
      ;;
    none)
      warn "BACKEND_RESTART_MODE=none — Backend manuell neu starten"
      ;;
    *)
      die "Unbekannter BACKEND_RESTART_MODE: $BACKEND_RESTART_MODE (systemd|pm2|none)"
      ;;
  esac
}

build_frontend() {
  log "Frontend bauen"
  run bash -c "cd '$FRONTEND_DIR' && npm ci"
  run bash -c "cd '$FRONTEND_DIR' && npm run build"
  ok "Frontend gebaut"
}

deploy_frontend() {
  local dist_dir="${FRONTEND_DIR}/dist"
  [[ -d "$dist_dir" ]] || die "Frontend dist/ fehlt — Build fehlgeschlagen?"

  log "Frontend nach $FRONTEND_DEPLOY_DIR kopieren"
  run mkdir -p "$FRONTEND_DEPLOY_DIR"

  if command -v rsync >/dev/null 2>&1; then
    run rsync -a --delete "${dist_dir}/" "${FRONTEND_DEPLOY_DIR}/"
  else
    run rm -rf "${FRONTEND_DEPLOY_DIR:?}"/*
    run cp -a "${dist_dir}/." "$FRONTEND_DEPLOY_DIR/"
  fi

  ok "Frontend deployed"
}

git_pull() {
  log "Git pull ($GIT_BRANCH)"
  run bash -c "cd '$REPO_DIR' && git fetch origin '$GIT_BRANCH'"
  run bash -c "cd '$REPO_DIR' && git checkout '$GIT_BRANCH'"
  run bash -c "cd '$REPO_DIR' && git pull --ff-only origin '$GIT_BRANCH'"
  ok "Code aktualisiert"
}

main() {
  log "Paketdienst Deployment starten"
  [[ "$DRY_RUN" == true ]] && warn "Dry-Run — es werden keine Änderungen vorgenommen"

  if [[ "$SKIP_PULL" == false ]]; then
    git_pull
  else
    warn "git pull übersprungen"
  fi

  if [[ "$SKIP_BACKEND" == false ]]; then
    backup_database
    build_backend
    restart_backend
  else
    warn "Backend-Deployment übersprungen"
  fi

  if [[ "$SKIP_FRONTEND" == false ]]; then
    build_frontend
    deploy_frontend
  else
    warn "Frontend-Deployment übersprungen"
  fi

  ok "Deployment abgeschlossen"
  log "Tipp: Im Browser Hard-Reload / privates Fenster zum Testen"
}

main
