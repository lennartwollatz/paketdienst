"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDhlShipment = isDhlShipment;
/** Erkennt DHL-/Deutsche-Post-Sendungen anhand Carrier-Name oder Sendungsnummer. */
function isDhlShipment(trackingNumber, carrier) {
    const carrierNorm = carrier?.trim().toLowerCase() ?? '';
    if (carrierNorm.includes('dhl') || carrierNorm.includes('deutsche post')) {
        return true;
    }
    return /^(00|JJD|JVGL|0034)/i.test(trackingNumber.trim());
}
//# sourceMappingURL=dhlDetection.js.map