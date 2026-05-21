"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_CATEGORY_IDS = exports.ORDER_CATEGORIES = void 0;
exports.categoryLabel = categoryLabel;
exports.normalizeOrderCategory = normalizeOrderCategory;
exports.isValidOrderCategory = isValidOrderCategory;
exports.ORDER_CATEGORIES = [
    { id: 'klamotten', label: 'Klamotten' },
    { id: 'software_technik', label: 'Software & Technik' },
    { id: 'kosmetik', label: 'Kosmetik' },
    { id: 'essen', label: 'Essen' },
    { id: 'transport_logistik', label: 'Transport & Logistik' },
    { id: 'freizeit_sport', label: 'Freizeit & Sport' },
    { id: 'auto', label: 'Auto' },
    { id: 'finanzen', label: 'Finanzen' },
    { id: 'gesundheit', label: 'Gesundheit' },
    { id: 'haus_wohnen', label: 'Haus & Wohnen' },
    { id: 'urlaub', label: 'Urlaub' },
];
const BY_ID = new Map(exports.ORDER_CATEGORIES.map((c) => [c.id, c]));
/** Label-Vergleich: „Software & Technik“ und „Software&Technik“ sind gleich. */
function normalizeCategoryLabelKey(label) {
    return label.trim().toLowerCase().replace(/\s*&\s*/g, ' & ');
}
const BY_LABEL = new Map(exports.ORDER_CATEGORIES.map((c) => [normalizeCategoryLabelKey(c.label), c]));
/** Kategorien für GPT-Prompt (exakte IDs). */
exports.ORDER_CATEGORY_IDS = exports.ORDER_CATEGORIES.map((c) => c.id);
function categoryLabel(id) {
    if (!id)
        return null;
    return BY_ID.get(id)?.label ?? id;
}
/** Normalisiert GPT-Ausgabe (ID oder Label) auf eine gültige Kategorie-ID. */
function normalizeOrderCategory(raw) {
    if (!raw?.trim())
        return null;
    const trimmed = raw.trim();
    if (BY_ID.has(trimmed))
        return trimmed;
    const byLabel = BY_LABEL.get(normalizeCategoryLabelKey(trimmed));
    if (byLabel)
        return byLabel.id;
    const slug = normalizeCategoryLabelKey(trimmed)
        .replace(/&/g, '_')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    if (BY_ID.has(slug))
        return slug;
    return null;
}
function isValidOrderCategory(id) {
    return !!id && BY_ID.has(id);
}
//# sourceMappingURL=orderCategories.js.map