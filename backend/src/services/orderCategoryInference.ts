import type { OrderCategoryId } from '../constants/orderCategories';

/** Bekannte Shops → typische Kategorie (nur wenn eindeutig). */
const SHOP_HINTS: Record<string, OrderCategoryId> = {
  zalando: 'klamotten',
  'about you': 'klamotten',
  'h&m': 'klamotten',
  hm: 'klamotten',
  asos: 'klamotten',
  mediamarkt: 'software_technik',
  saturn: 'software_technik',
  apple: 'software_technik',
  steam: 'software_technik',
  rewe: 'essen',
  flaschenpost: 'essen',
  lieferando: 'essen',
  dm: 'kosmetik',
  douglas: 'kosmetik',
  booking: 'urlaub',
  airbnb: 'urlaub',
  expedia: 'urlaub',
  autodoc: 'auto',
  atu: 'auto',
};

const CONTENT_RULES: { category: OrderCategoryId; pattern: RegExp }[] = [
  {
    category: 'software_technik',
    pattern: /\b(laptop|notebook|tablet|smartphone|iphone|ipad|monitor|grafikkarte|software|hardware|elektronik|computer|playstation|xbox|nintendo|steam|macbook|festplatte|ssd|router|smartwatch|kopfhörer|tv\b|fernseher)\b/i,
  },
  {
    category: 'klamotten',
    pattern: /\b(sneaker|schuh|jacke|hose|hemd|shirt|kleid|mode|textil|pullover|hoodie|größe\s*[smlxl\d]{1,3}\b|fashion|socken)\b/i,
  },
  {
    category: 'kosmetik',
    pattern: /\b(parfum|shampoo|creme|make-up|makeup|kosmetik|hautpflege|duschgel|lippenstift|serum)\b/i,
  },
  {
    category: 'essen',
    pattern: /\b(lebensmittel|supermarkt|restaurant|pizza|lieferung.*essen|getränk|kaffee|bio\s+box|meal\s+kit)\b/i,
  },
  {
    category: 'freizeit_sport',
    pattern: /\b(fitness|sport|yoga|fahrrad|rad\b|laufschuh|training|camp|ticket|konzert|hobby|outdoor|wandern)\b/i,
  },
  {
    category: 'auto',
    pattern: /\b(autoteil|reifen|motoröl|werkstatt|kfz|fahrzeug|bremsbelag|autopflege)\b/i,
  },
  {
    category: 'gesundheit',
    pattern: /\b(apotheke|medikament|arznei|vitamin|nahrungsergänzung|rezept|gesundheit)\b/i,
  },
  {
    category: 'haus_wohnen',
    pattern: /\b(möbel|sofa|matratze|lampe|baumarkt|garten|küche|wohnung|regal|bett\b|teppich|ikea)\b/i,
  },
  {
    category: 'urlaub',
    pattern: /\b(flug|hotel|reise|ferienwohnung|pauschalreise|bahn\s+ticket|airbnb|booking\.com|urlaub)\b/i,
  },
  {
    category: 'finanzen',
    pattern: /\b(versicherung|bank\b|konto\b|depot|kredit|steuer|finanz)\b/i,
  },
  {
    category: 'transport_logistik',
    pattern: /\b(nur\s+versand|sendungsverfolgung|tracking\s+update|paket\s+wird\s+zugestellt)\b/i,
  },
];

/**
 * Regelbasierter Fallback, wenn GPT keine Kategorie liefert.
 * Gibt null zurück, wenn keine sichere Zuordnung möglich ist.
 */
export function inferOrderCategory(
  shop: string | null | undefined,
  subject: string,
  body: string,
): OrderCategoryId | null {
  const shopNorm = shop?.trim().toLowerCase() ?? '';
  if (shopNorm && shopNorm !== 'unbekannt') {
    for (const [hint, category] of Object.entries(SHOP_HINTS)) {
      if (shopNorm.includes(hint)) return category;
    }
  }

  const text = `${subject}\n${body}`.slice(0, 12_000);
  for (const { category, pattern } of CONTENT_RULES) {
    if (pattern.test(text)) return category;
  }

  return null;
}
