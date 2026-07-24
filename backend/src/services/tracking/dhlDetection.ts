/** Erkennt DHL-/Deutsche-Post-Sendungen anhand Carrier-Name oder Sendungsnummer. */
export function isDhlShipment(trackingNumber: string, carrier?: string): boolean {
  const carrierNorm = carrier?.trim().toLowerCase() ?? '';
  if (carrierNorm.includes('dhl') || carrierNorm.includes('deutsche post')) {
    return true;
  }
  return /^(00|JJD|JVGL|0034)/i.test(trackingNumber.trim());
}
