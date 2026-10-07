/** Testnutzer (Stripe-Bypass, Demo-Login) — in Produktion standardmäßig aus. */
export function isTestAccessEnabled(): boolean {
  const v = process.env.TEST_ACCESS_ENABLED?.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

export function effectiveIsTestUser(dbIsTestUser: boolean): boolean {
  return dbIsTestUser && isTestAccessEnabled();
}
