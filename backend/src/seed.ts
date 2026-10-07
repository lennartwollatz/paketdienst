import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { isTestAccessEnabled } from './lib/testAccess';

const prisma = new PrismaClient();
const TEST_EMAIL = 'lena@test.local';

async function main() {
  console.log('Seed wird ausgeführt...');

  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });

  if (!isTestAccessEnabled()) {
    if (existing?.isTestUser) {
      await prisma.user.update({
        where: { email: TEST_EMAIL },
        data: { isTestUser: false },
      });
      console.log('Testzugang deaktiviert — isTestUser für lena@test.local entfernt');
    } else {
      console.log('Testzugang deaktiviert — kein Testuser angelegt');
    }
    console.log('Seed abgeschlossen.');
    return;
  }

  if (!existing) {
    const passwordHash = await bcrypt.hash('lennart', 12);
    const testUser = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
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
