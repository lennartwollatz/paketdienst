"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seed wird ausgeführt...');
    // Testuser anlegen (lena / lennart)
    const existing = await prisma.user.findUnique({ where: { email: 'lena@test.local' } });
    if (!existing) {
        const passwordHash = await bcryptjs_1.default.hash('lennart', 12);
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