import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function resolveSqlitePath(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL fehlt');
  const m = url.match(/^file:(.+)$/);
  if (!m) throw new Error(`Kein SQLite file: URL: ${url}`);
  let raw = m[1].replace(/^["']|["']$/g, '');
  if (raw.startsWith('./')) return path.join(process.cwd(), raw.slice(2));
  if (path.isAbsolute(raw)) return raw;
  return path.join(process.cwd(), raw);
}

async function main() {
  const dbPath = resolveSqlitePath();
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  console.log('Aufgelöster Pfad:', dbPath);
  console.log('Datei existiert:', fs.existsSync(dbPath));
  if (fs.existsSync(dbPath)) {
    console.log('Größe (Bytes):', fs.statSync(dbPath).size);
  }

  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({ select: { id: true, email: true, isTestUser: true } });
  console.log(`User-Anzahl: ${users.length}`);
  for (const u of users) {
    console.log(`  - ${u.email}${u.isTestUser ? ' (Testuser)' : ''}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
