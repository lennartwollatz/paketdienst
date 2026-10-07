/**
 * Nur Inhalte löschen (Nutzer + alle App-Daten), DB-Datei bleibt.
 * Backend stoppen empfohlen: sudo systemctl stop paketdienst-api
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main() {
  if (process.env.FORCE !== '1') {
    console.error('Fortfahren mit: FORCE=1 npm run db:purge-users');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const before = await prisma.user.count();
    await prisma.trackingEvent.deleteMany();
    await prisma.orderAttachment.deleteMany();
    await prisma.orderEmail.deleteMany();
    await prisma.order.deleteMany();
    await prisma.emailAccount.deleteMany();
    await prisma.shopCategory.deleteMany();
    await prisma.pushSubscription.deleteMany();
    await prisma.processedEmail.deleteMany();
    const { count } = await prisma.user.deleteMany();
    console.log(`Vorher ${before} Nutzer, gelöscht: ${count}, jetzt: ${await prisma.user.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
