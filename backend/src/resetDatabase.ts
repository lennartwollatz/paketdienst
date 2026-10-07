import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function resolveSqlitePath(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL fehlt in backend/.env');
  }
  const m = url.match(/^file:(.+)$/);
  if (!m) {
    throw new Error(`Nur SQLite file:-URLs werden unterstützt (aktuell: ${url})`);
  }
  let raw = m[1].replace(/^["']|["']$/g, '');
  if (raw.startsWith('./')) {
    return path.join(process.cwd(), raw.slice(2));
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.join(process.cwd(), raw);
}

function main() {
  if (process.env.FORCE !== '1') {
    console.error(
      'Alle App-Daten (Nutzer, Bestellungen, E-Mail-Konten, …) werden gelöscht.\n' +
        'Backend sollte gestoppt sein (z. B. sudo systemctl stop paketdienst-api).\n' +
        'Fortfahren mit: FORCE=1 npm run db:reset',
    );
    process.exit(1);
  }

  const dbPath = resolveSqlitePath();
  const journal = `${dbPath}-journal`;

  if (fs.existsSync(dbPath)) {
    const backupDir = path.join(process.cwd(), '..', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(backupDir, `${path.basename(dbPath)}.${stamp}.before-reset.bak`);
    fs.copyFileSync(dbPath, backup);
    console.log(`Backup: ${backup}`);
    fs.unlinkSync(dbPath);
    console.log(`Gelöscht: ${dbPath}`);
  } else {
    console.log(`Keine Datei (schon leer): ${dbPath}`);
  }

  if (fs.existsSync(journal)) {
    fs.unlinkSync(journal);
  }

  console.log('Migrationen anwenden …');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: process.cwd() });
  console.log('Fertig — leere Datenbank mit Tabellen. Optional: npm run db:seed');
}

main();
