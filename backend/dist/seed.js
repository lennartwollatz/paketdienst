"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const testAccess_1 = require("./lib/testAccess");
const prisma = new client_1.PrismaClient();
const TEST_EMAIL = 'lena@test.local';
async function main() {
    console.log('Seed wird ausgeführt...');
    const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!(0, testAccess_1.isTestAccessEnabled)()) {
        if (existing?.isTestUser) {
            await prisma.user.update({
                where: { email: TEST_EMAIL },
                data: { isTestUser: false },
            });
            console.log('Testzugang deaktiviert — isTestUser für lena@test.local entfernt');
        }
        else {
            console.log('Testzugang deaktiviert — kein Testuser angelegt');
        }
        console.log('Seed abgeschlossen.');
        return;
    }
    if (!existing) {
        const passwordHash = await bcryptjs_1.default.hash('lennart', 12);
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
    }
    else {
        console.log('Testuser existiert bereits');
    }
    console.log('Seed abgeschlossen.');
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map