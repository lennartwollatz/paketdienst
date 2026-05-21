"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrackingPoller = startTrackingPoller;
const client_1 = require("@prisma/client");
const refreshOrder_1 = require("./refreshOrder");
const prisma = new client_1.PrismaClient();
async function runTrackingPoll() {
    const orders = await prisma.order.findMany({
        where: {
            trackingNumber: { not: null },
            status: { in: [...refreshOrder_1.ACTIVE_TRACKING_STATUSES] },
        },
        select: { id: true },
        orderBy: { updatedAt: 'asc' },
    });
    if (orders.length === 0) {
        console.log('[tracking-poller] Keine offenen Sendungen mit Tracking-Nummer – nichts zu tun.');
        return;
    }
    console.log(`[tracking-poller] Aktualisiere ${orders.length} Sendung(en)...`);
    let updated = 0;
    let failed = 0;
    for (const order of orders) {
        try {
            const didRefresh = await (0, refreshOrder_1.refreshOrderTracking)(order.id);
            if (didRefresh)
                updated++;
        }
        catch (err) {
            failed++;
            console.error(`[tracking-poller] Fehler bei Order ${order.id}:`, err.message);
        }
    }
    console.log(`[tracking-poller] Fertig: ${updated} aktualisiert, ${failed} Fehler.`);
}
function startTrackingPoller() {
    const enabled = process.env.TRACKING_POLLING_ENABLED !== 'false';
    if (!enabled) {
        console.log('[tracking-poller] Deaktiviert (TRACKING_POLLING_ENABLED=false).');
        return;
    }
    const intervalMs = Number(process.env.TRACKING_POLLING_INTERVAL_MS || 30 * 60 * 1000);
    console.log(`[tracking-poller] Gestartet – Intervall: ${Math.round(intervalMs / 60000)} Minuten`);
    runTrackingPoll().catch((err) => console.error('[tracking-poller] Initialer Lauf fehlgeschlagen:', err));
    setInterval(() => {
        runTrackingPoll().catch((err) => console.error('[tracking-poller] Polling fehlgeschlagen:', err));
    }, intervalMs);
}
//# sourceMappingURL=poller.js.map