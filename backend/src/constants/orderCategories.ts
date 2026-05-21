export const ORDER_CATEGORIES = [
  { id: 'klamotten',           label: 'Klamotten' },
  { id: 'software_technik',    label: 'Software & Technik' },
  { id: 'kosmetik',            label: 'Kosmetik' },
  { id: 'essen',               label: 'Essen' },
  { id: 'transport_logistik',  label: 'Transport & Logistik' },
  { id: 'freizeit_sport',      label: 'Freizeit & Sport' },
  { id: 'auto',                label: 'Auto' },
  { id: 'finanzen',            label: 'Finanzen' },
  { id: 'gesundheit',          label: 'Gesundheit' },
  { id: 'haus_wohnen',         label: 'Haus & Wohnen' },
  { id: 'urlaub',              label: 'Urlaub' },
] as const;

export type OrderCategoryId = (typeof ORDER_CATEGORIES)[number]['id'];

const BY_ID = new Map(ORDER_CATEGORIES.map((c) => [c.id, c]));
/** Label-Vergleich: „Software & Technik“ und „Software&Technik“ sind gleich. */
function normalizeCategoryLabelKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s*&\s*/g, ' & ');
}

const BY_LABEL = new Map(
  ORDER_CATEGORIES.map((c) => [normalizeCategoryLabelKey(c.label), c]),
);

/** Kategorien für GPT-Prompt (exakte IDs). */
export const ORDER_CATEGORY_IDS = ORDER_CATEGORIES.map((c) => c.id);

export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return BY_ID.get(id as OrderCategoryId)?.label ?? id;
}

/** Normalisiert GPT-Ausgabe (ID oder Label) auf eine gültige Kategorie-ID. */
export function normalizeOrderCategory(raw: string | null | undefined): OrderCategoryId | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (BY_ID.has(trimmed as OrderCategoryId)) return trimmed as OrderCategoryId;

  const byLabel = BY_LABEL.get(normalizeCategoryLabelKey(trimmed));
  if (byLabel) return byLabel.id;

  const slug = normalizeCategoryLabelKey(trimmed)
    .replace(/&/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (BY_ID.has(slug as OrderCategoryId)) return slug as OrderCategoryId;

  return null;
}

export function isValidOrderCategory(id: string | null | undefined): id is OrderCategoryId {
  return !!id && BY_ID.has(id as OrderCategoryId);
}
