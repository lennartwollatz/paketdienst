#!/usr/bin/env node
/**
 * Einmalig auf dem Server: .env aus deploy/*-production.example anlegen (nur wenn noch nicht vorhanden).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pairs = [
  {
    dest: path.join(repoRoot, 'backend', '.env'),
    src: path.join(repoRoot, 'deploy', 'env.backend.production.example'),
  },
  {
    dest: path.join(repoRoot, 'frontend', '.env'),
    src: path.join(repoRoot, 'deploy', 'env.frontend.production.example'),
  },
];

let created = 0;

for (const { dest, src } of pairs) {
  if (fs.existsSync(dest)) {
    console.log(`Überspringe (existiert bereits): ${dest}`);
    continue;
  }
  if (!fs.existsSync(src)) {
    console.error(`Vorlage fehlt: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`Angelegt: ${dest} ← ${path.relative(repoRoot, src)}`);
  created++;
}

if (created === 0) {
  console.log('Nichts zu tun — beide .env-Dateien sind schon da.');
} else {
  console.log('\nBitte jetzt bearbeiten:');
  console.log('  nano backend/.env');
  console.log('  nano frontend/.env');
  console.log('Mindestens JWT_SECRET, Stripe-Keys und ggf. OPENAI_API_KEY setzen.');
}
