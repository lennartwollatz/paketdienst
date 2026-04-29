"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const mailer_1 = require("../services/mailer");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Ungültige E-Mail-Adresse'),
    password: zod_1.z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
function generateToken(userId, email) {
    return jsonwebtoken_1.default.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { email, password } = registerSchema.parse(req.body);
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'E-Mail bereits registriert' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, passwordHash },
        });
        const token = generateToken(user.id, user.email);
        return res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                isTestUser: user.isTestUser,
                hasPaymentMethod: user.hasPaymentMethod,
            },
        });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
        }
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
        }
        const token = generateToken(user.id, user.email);
        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                isTestUser: user.isTestUser,
                hasPaymentMethod: user.hasPaymentMethod,
            },
        });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Ungültige Eingabe' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Login fehlgeschlagen' });
    }
});
// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = zod_1.z.object({ email: zod_1.z.string().email() }).parse(req.body);
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Keine Info ob User existiert (Sicherheit)
            return res.json({ message: 'Falls die E-Mail registriert ist, wurde ein Reset-Link gesendet.' });
        }
        const resetToken = (0, uuid_1.v4)();
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 Stunde
        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetTokenExpiry },
        });
        await (0, mailer_1.sendPasswordResetEmail)(email, resetToken);
        return res.json({ message: 'Falls die E-Mail registriert ist, wurde ein Reset-Link gesendet.' });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Senden der E-Mail' });
    }
});
// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = zod_1.z.object({
            token: zod_1.z.string(),
            password: zod_1.z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
        }).parse(req.body);
        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: { gt: new Date() },
            },
        });
        if (!user) {
            return res.status(400).json({ error: 'Ungültiger oder abgelaufener Reset-Token' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash, resetToken: null, resetTokenExpiry: null },
        });
        return res.json({ message: 'Passwort erfolgreich zurückgesetzt' });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Zurücksetzen des Passworts' });
    }
});
// POST /api/auth/change-password
router.post('/change-password', auth_1.requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = zod_1.z.object({
            currentPassword: zod_1.z.string(),
            newPassword: zod_1.z.string().min(8, 'Neues Passwort muss mindestens 8 Zeichen lang sein'),
        }).parse(req.body);
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user)
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        const valid = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
        if (!valid) {
            return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });
        }
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        return res.json({ message: 'Passwort erfolgreich geändert' });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: err.errors[0].message });
        }
        console.error(err);
        return res.status(500).json({ error: 'Fehler beim Ändern des Passworts' });
    }
});
// GET /api/auth/me
router.get('/me', auth_1.requireAuth, async (req, res) => {
    return res.json({
        user: {
            id: req.user.id,
            email: req.user.email,
            isTestUser: req.user.isTestUser,
            hasPaymentMethod: req.user.hasPaymentMethod,
        },
    });
});
exports.default = router;
//# sourceMappingURL=auth.js.map