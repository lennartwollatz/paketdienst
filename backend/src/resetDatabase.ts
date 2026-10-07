import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

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

/** Alle Tabellen leeren (inkl. User) — auch wenn die DB-Datei danach neu angelegt wird. */
async function purgeAllAppData(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.user.count();
    console.log(`Nutzer vor dem Löschen: ${before}`);

    await prisma.trackingEvent.deleteMany();
    await prisma.orderAttachment.deleteMany();
    await prisma.orderEmail.deleteMany();
    await prisma.order.deleteMany();
    await prisma.emailAccount.deleteMany();
    await prisma.shopCategory.deleteMany();
    await prisma.pushSubscription.deleteMany();
    await prisma.processedEmail.deleteMany();
    const deleted = await prisma.user.deleteMany();

    console.log(`Gelöscht: ${deleted.count} Nutzer (und zugehörige Daten per Cascade/deleteMany)`);
    const after = await prisma.user.count();
    if (after !== 0) {
      throw new Error(`User-Tabelle nicht leer (noch ${after} Einträge)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function backupAndUnlink(dbPath: string): void {
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
}

/** Alte/abweichende SQLite-Dateien im backend-Ordner (häufige Ursache „E-Mail schon registriert“). */
function purgeExtraSqliteFiles(primaryPath: string): void {
  const backendDir = process.cwd();
  const names = ['dev.db', 'prod.db', path.join('prisma', 'dev.db'), path.join('prisma', 'prod.db')];
  const primary = path.resolve(primaryPath);
  for (const rel of names) {
    const full = path.join(backendDir, rel);
    if (full === primary || !fs.existsSync(full)) continue;
    console.warn(`Zusätzliche DB gefunden (wird entfernt): ${full}`);
    backupAndUnlink(full);
  }
}

async function main() {
  if (process.env.FORCE !== '1') {
    console.error(
      'Alle App-Daten inkl. aller Nutzer werden gelöscht.\n' +
        'Backend sollte gestoppt sein (z. B. sudo systemctl stop paketdienst-api).\n' +
        'Fortfahren mit: FORCE=1 npm run db:reset',
    );
    process.exit(1);
  }

  const dbPath = resolveSqlitePath();
  console.log('Ziel-Datenbank:', dbPath);

  if (fs.existsSync(dbPath)) {
    await purgeAllAppData();
  }

  backupAndUnlink(dbPath);
  purgeExtraSqliteFiles(dbPath);

  console.log('Migrationen anwenden …');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: process.cwd() });

  const prisma = new PrismaClient();
  const remaining = await prisma.user.count();
  await prisma.$disconnect();
  console.log(`Fertig — User in neuer DB: ${remaining} (soll 0 sein). Kein db:seed, wenn leer bleiben soll.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
