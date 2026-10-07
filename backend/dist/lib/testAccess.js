"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTestAccessEnabled = isTestAccessEnabled;
exports.effectiveIsTestUser = effectiveIsTestUser;
/** Testnutzer (Stripe-Bypass, Demo-Login) — in Produktion standardmäßig aus. */
function isTestAccessEnabled() {
    const v = process.env.TEST_ACCESS_ENABLED?.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes')
        return true;
    if (v === 'false' || v === '0' || v === 'no')
        return false;
    return process.env.NODE_ENV !== 'production';
}
function effectiveIsTestUser(dbIsTestUser) {
    return dbIsTestUser && isTestAccessEnabled();
}
//# sourceMappingURL=testAccess.js.map