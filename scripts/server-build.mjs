#!/usr/bin/env node
/**
 * Produktions-Deploy vom Repo-Root: git pull → npm ci → Prisma → Build → systemd.
 * Konfiguration: deploy/production.json
 * Auf dem Server: DEPLOY_SUDO=1 npm run build
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`\x1b[1;34m=>\x1b[0m ${msg}`);
}
function ok(msg) {
  console.log(`\x1b[1;32m✓\x1b[0m ${msg}`);
}
function warn(msg) {
  console.warn(`\x1b[1;33m!\x1b[0m ${msg}`);
}
function die(msg) {
  console.error(`\x1b[1;31mFehler:\x1b[0m ${msg}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  log(cmd);
  execSync(cmd, { stdio: 'inherit', cwd: REPO_ROOT, ...opts });
}

function sudoPrefix() {
  return process.env.DEPLOY_SUDO === '1' ? 'sudo ' : '';
}

function loadConfig() {
  const configPath = path.join(REPO_ROOT, 'deploy', 'production.json');
  if (!fs.existsSync(configPath)) {
    die('deploy/production.json fehlt');
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  cfg.appDir = cfg.appDir || cfg.app || '/var/www/paketdienst';
  cfg.user = cfg.user || 'smarthome';
  return cfg;
}

function resolveDbPath(backendEnvPath, backendDir) {
  const text = fs.readFileSync(backendEnvPath, 'utf8');
  const line = text.split('\n').find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) die('DATABASE_URL nicht in backend/.env gefunden');
  const url = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  const m = url.match(/^file:(.+)$/);
  if (!m) die(`Nur SQLite file:-URLs werden unterstützt (aktuell: ${url})`);
  let raw = m[1];
  if (raw.startsWith('./')) return path.join(backendDir, raw.slice(2));
  if (path.isAbsolute(raw)) return raw;
  return path.join(backendDir, raw);
}

function backupDatabase(cfg) {
  const backendDir = path.join(REPO_ROOT, 'backend');
  const envPath = path.join(backendDir, '.env');
  if (!fs.existsSync(envPath)) {
    warn('backend/.env fehlt — überspringe DB-Backup');
    return;
  }
  let dbPath;
  try {
    dbPath = resolveDbPath(envPath, backendDir);
  } catch (e) {
    warn(String(e.message || e));
    return;
  }
  if (!fs.existsSync(dbPath)) {
    warn(`Datenbank noch nicht vorhanden (${dbPath}) — überspringe Backup`);
    return;
  }
  const backupDir = path.join(REPO_ROOT, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.bak`);
  fs.copyFileSync(dbPath, dest);
  ok(`Backup: ${dest}`);
}

function pm2Cleanup(names) {
  for (const name of names) {
    try {
      execSync(`pm2 delete ${name}`, { stdio: 'ignore' });
      ok(`PM2-Prozess entfernt: ${name}`);
    } catch {
      /* nicht vorhanden */
    }
  }
}

function installSystemdUnits(cfg) {
  const sudo = sudoPrefix();
  const units = [
    `${cfg.apiUnit}.service`,
    `${cfg.webUnit}.service`,
    `${cfg.targetUnit}`,
  ];
  for (const unit of units) {
    const src = path.join(REPO_ROOT, 'deploy', unit);
    if (!fs.existsSync(src)) die(`deploy/${unit} fehlt`);
    run(`${sudo}cp "${src}" /etc/systemd/system/`);
  }

  const patchService = (unitFile) => {
    const full = `/etc/systemd/system/${unitFile}`;
    if (unitFile === `${cfg.apiUnit}.service`) {
      run(
        `${sudo}sed -i "s|^WorkingDirectory=.*|WorkingDirectory=${cfg.appDir}/backend|" "${full}"`,
      );
    } else if (unitFile === `${cfg.webUnit}.service`) {
      run(`${sudo}sed -i "s|^WorkingDirectory=.*|WorkingDirectory=${cfg.appDir}|" "${full}"`);
      run(
        `${sudo}sed -i "s|^Environment=FRONTEND_DIST=.*|Environment=FRONTEND_DIST=${cfg.appDir}/frontend/dist|" "${full}"`,
      );
    }
    if (unitFile.endsWith('.service')) {
      run(`${sudo}sed -i "s|^User=.*|User=${cfg.user}|" "${full}"`);
      run(`${sudo}sed -i "s|^Group=.*|Group=${cfg.user}|" "${full}"`);
    }
  };

  patchService(`${cfg.apiUnit}.service`);
  patchService(`${cfg.webUnit}.service`);

  run(`${sudo}systemctl daemon-reload`);
  run(`${sudo}systemctl enable ${cfg.apiUnit} ${cfg.webUnit} ${cfg.targetUnit}`);
}

function restartServices(cfg) {
  const sudo = sudoPrefix();
  run(`${sudo}systemctl restart ${cfg.apiUnit} ${cfg.webUnit}`);
  const status = spawnSync(
    'bash',
    ['-lc', `${sudo}systemctl is-active ${cfg.apiUnit} ${cfg.webUnit}`],
    { encoding: 'utf8' },
  );
  if (status.status !== 0) {
    die('Dienste nicht aktiv — journalctl prüfen (siehe deploy/INSTALL-SERVER.md)');
  }
  ok('systemd-Dienste neu gestartet');
}

function healthCheck(cfg) {
  const apiUrl = `http://127.0.0.1:${cfg.apiPort}/api/health`;
  const webUrl = `http://127.0.0.1:${cfg.webPort}${cfg.basePath}/`;

  let apiBody;
  try {
    apiBody = execSync(`curl -sf "${apiUrl}"`, { encoding: 'utf8' });
  } catch {
    die(`API-Health fehlgeschlagen: ${apiUrl}`);
  }
  if (!apiBody.includes('"status"')) {
    die(`Unerwartete API-Antwort: ${apiBody.slice(0, 200)}`);
  }
  ok(`API OK: ${apiUrl}`);

  let code;
  try {
    code = execSync(`curl -s -o /dev/null -w "%{http_code}" "${webUrl}"`, {
      encoding: 'utf8',
    }).trim();
  } catch {
    die(`Frontend-Check fehlgeschlagen: ${webUrl}`);
  }
  if (code !== '200') {
    die(`Frontend erwartet HTTP 200, bekam ${code} für ${webUrl}`);
  }
  ok(`Frontend OK: ${webUrl} (${code})`);
}

function main() {
  const cfg = loadConfig();

  if (process.env.SKIP_GIT_PULL !== '1') {
    log(`Git pull (${cfg.gitBranch})`);
    run(`git fetch origin ${cfg.gitBranch}`);
    run(`git pull --ff-only origin ${cfg.gitBranch}`);
    ok('Code aktualisiert');
  } else {
    warn('git pull übersprungen (SKIP_GIT_PULL=1)');
  }

  const backendEnv = path.join(REPO_ROOT, 'backend', '.env');
  const frontendEnv = path.join(REPO_ROOT, 'frontend', '.env');
  if (!fs.existsSync(backendEnv) || !fs.existsSync(frontendEnv)) {
    die(
      'backend/.env oder frontend/.env fehlt — einmalig: npm run env:init\n' +
        'Dann Werte anpassen (nano backend/.env frontend/.env), siehe deploy/INSTALL-SERVER.md',
    );
  }

  log('Abhängigkeiten (npm ci)');
  run('npm ci --prefix backend');
  run('npm ci --prefix frontend');

  backupDatabase(cfg);

  log('Prisma');
  run('npm run db:generate --prefix backend');
  run('npm run db:deploy --prefix backend');

  log('Build Backend + Frontend');
  run('npm run build:backend');
  run('npm run build:frontend');

  if (process.env.SKIP_SYSTEMD === '1') {
    warn('systemd übersprungen (SKIP_SYSTEMD=1)');
    ok('Build abgeschlossen (ohne Dienst-Neustart)');
    return;
  }

  if (process.platform !== 'linux') {
    warn('Kein Linux — systemd übersprungen. Nur Build ausgeführt.');
    return;
  }

  pm2Cleanup(cfg.pm2LegacyNames || []);

  log('systemd-Units installieren');
  installSystemdUnits(cfg);
  restartServices(cfg);
  healthCheck(cfg);

  ok('Deployment abgeschlossen');
  log(`Öffentlich: ${cfg.publicUrl}`);
}

main();
