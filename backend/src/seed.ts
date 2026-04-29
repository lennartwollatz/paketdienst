import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed wird ausgeführt...');

  // Testuser anlegen (lena / lennart)
  const existing = await prisma.user.findUnique({ where: { email: 'lena@test.local' } });
  if (!existing) {
    const passwordHash = await bcrypt.hash('lennart', 12);
    const testUser = await prisma.user.create({
      data: {
        email: 'lena@test.local',
        passwordHash,
        isTestUser: true,
        hasPaymentMethod: true,
      },
    });
    console.log(`Testuser angelegt: ${testUser.email} (ID: ${testUser.id})`);
    console.log('Login: Email: lena@test.local, Passwort: lennart');
  } else {
    console.log('Testuser existiert bereits');
  }

  console.log('Seed abgeschlossen.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
