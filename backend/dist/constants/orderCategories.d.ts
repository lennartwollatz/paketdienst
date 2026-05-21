export declare const ORDER_CATEGORIES: readonly [{
    readonly id: "klamotten";
    readonly label: "Klamotten";
}, {
    readonly id: "software_technik";
    readonly label: "Software & Technik";
}, {
    readonly id: "kosmetik";
    readonly label: "Kosmetik";
}, {
    readonly id: "essen";
    readonly label: "Essen";
}, {
    readonly id: "transport_logistik";
    readonly label: "Transport & Logistik";
}, {
    readonly id: "freizeit_sport";
    readonly label: "Freizeit & Sport";
}, {
    readonly id: "auto";
    readonly label: "Auto";
}, {
    readonly id: "finanzen";
    readonly label: "Finanzen";
}, {
    readonly id: "gesundheit";
    readonly label: "Gesundheit";
}, {
    readonly id: "haus_wohnen";
    readonly label: "Haus & Wohnen";
}, {
    readonly id: "urlaub";
    readonly label: "Urlaub";
}];
export type OrderCategoryId = (typeof ORDER_CATEGORIES)[number]['id'];
/** Kategorien für GPT-Prompt (exakte IDs). */
export declare const ORDER_CATEGORY_IDS: ("klamotten" | "software_technik" | "kosmetik" | "essen" | "transport_logistik" | "freizeit_sport" | "auto" | "finanzen" | "gesundheit" | "haus_wohnen" | "urlaub")[];
export declare function categoryLabel(id: string | null | undefined): string | null;
/** Normalisiert GPT-Ausgabe (ID oder Label) auf eine gültige Kategorie-ID. */
export declare function normalizeOrderCategory(raw: string | null | undefined): OrderCategoryId | null;
export declare function isValidOrderCategory(id: string | null | undefined): id is OrderCategoryId;
//# sourceMappingURL=orderCategories.d.ts.map