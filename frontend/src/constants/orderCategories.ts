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

export function categoryLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return BY_ID.get(id as OrderCategoryId)?.label ?? id;
}
