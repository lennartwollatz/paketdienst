import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function normalizeShopKey(shop: string): string {
  return shop.trim().toLowerCase();
}

export async function getShopCategoryRule(
  userId: string,
  shop: string,
): Promise<string | null> {
  const shopKey = normalizeShopKey(shop);
  if (!shopKey || shopKey === 'unbekannt') return null;
  const row = await prisma.shopCategory.findUnique({
    where: { userId_shopKey: { userId, shopKey } },
  });
  return row?.category ?? null;
}

type ExistingCategory = {
  category: string | null;
  categoryManual: boolean;
};

/**
 * Kategorie für Sync/Anlage: manuelle Zuordnung bleibt, sonst Anbieter-Regel, sonst GPT/bestehend.
 */
export async function resolveOrderCategory(
  userId: string,
  shop: string,
  gptCategory: string | null | undefined,
  existing?: ExistingCategory,
): Promise<string | null> {
  if (existing?.categoryManual) {
    return existing.category;
  }
  const rule = await getShopCategoryRule(userId, shop);
  if (rule) return rule;
  if (existing?.category) return existing.category;
  return gptCategory ?? null;
}

/** Speichert Anbieter-Regel und setzt Kategorie bei allen nicht-manuellen Bestellungen desselben Shops. */
export async function applyShopCategoryAssignment(
  userId: string,
  shop: string,
  category: string | null,
  excludeOrderId: string,
): Promise<number> {
  const shopKey = normalizeShopKey(shop);
  if (!shopKey || shopKey === 'unbekannt') return 0;

  if (category === null) {
    await prisma.shopCategory.deleteMany({ where: { userId, shopKey } });
  } else {
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

  if (ids.length === 0) return 0;

  await prisma.order.updateMany({
    where: { id: { in: ids } },
    data: { category },
  });

  return ids.length;
}
