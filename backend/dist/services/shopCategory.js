"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeShopKey = normalizeShopKey;
exports.getShopCategoryRule = getShopCategoryRule;
exports.resolveOrderCategory = resolveOrderCategory;
exports.applyShopCategoryAssignment = applyShopCategoryAssignment;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function normalizeShopKey(shop) {
    return shop.trim().toLowerCase();
}
async function getShopCategoryRule(userId, shop) {
    const shopKey = normalizeShopKey(shop);
    if (!shopKey || shopKey === 'unbekannt')
        return null;
    const row = await prisma.shopCategory.findUnique({
        where: { userId_shopKey: { userId, shopKey } },
    });
    return row?.category ?? null;
}
/**
 * Kategorie für Sync/Anlage: manuelle Zuordnung bleibt, sonst Anbieter-Regel, sonst GPT/bestehend.
 */
async function resolveOrderCategory(userId, shop, gptCategory, existing) {
    if (existing?.categoryManual) {
        return existing.category;
    }
    const rule = await getShopCategoryRule(userId, shop);
    if (rule)
        return rule;
    if (existing?.category)
        return existing.category;
    return gptCategory ?? null;
}
/** Speichert Anbieter-Regel und setzt Kategorie bei allen nicht-manuellen Bestellungen desselben Shops. */
async function applyShopCategoryAssignment(userId, shop, category, excludeOrderId) {
    const shopKey = normalizeShopKey(shop);
    if (!shopKey || shopKey === 'unbekannt')
        return 0;
    if (category === null) {
        await prisma.shopCategory.deleteMany({ where: { userId, shopKey } });
    }
    else {
        await prisma.shopCategory.upsert({
            where: { userId_shopKey: { userId, shopKey } },
            create: {
                userId,
                shopKey,
                shopDisplay: shop.trim(),
                category,
            },
            update: {
                category,
                shopDisplay: shop.trim(),
            },
        });
    }
    const siblings = await prisma.order.findMany({
        where: {
            userId,
            id: { not: excludeOrderId },
            categoryManual: false,
        },
        select: { id: true, shop: true },
    });
    const shopKeyNorm = shopKey;
    const ids = siblings
        .filter((o) => normalizeShopKey(o.shop) === shopKeyNorm)
        .map((o) => o.id);
    if (ids.length === 0)
        return 0;
    await prisma.order.updateMany({
        where: { id: { in: ids } },
        data: { category },
    });
    return ids.length;
}
//# sourceMappingURL=shopCategory.js.map