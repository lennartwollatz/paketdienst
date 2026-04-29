"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = __importDefault(require("./routes/auth"));
const emailAccounts_1 = __importDefault(require("./routes/emailAccounts"));
const orders_1 = __importDefault(require("./routes/orders"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const poller_1 = require("./services/tracking/poller");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
app.use('/api/auth', auth_1.default);
app.use('/api/email-accounts', emailAccounts_1.default);
app.use('/api/orders', orders_1.default);
app.use('/api/stripe', stripe_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use((err, _req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Interner Serverfehler', message: err.message });
});
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
    (0, poller_1.startTrackingPoller)();
});
exports.default = app;
//# sourceMappingURL=index.js.map