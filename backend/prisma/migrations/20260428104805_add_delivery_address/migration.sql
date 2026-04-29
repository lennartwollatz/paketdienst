/*
  Warnings:

  - You are about to drop the column `deliveryStatus` on the `Order` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emailAccountId" TEXT,
    "shop" TEXT NOT NULL,
    "orderNumber" TEXT,
    "trackingNumber" TEXT,
    "carrier" TEXT,
    "price" REAL,
    "currency" TEXT DEFAULT 'EUR',
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "orderDate" DATETIME,
    "estimatedDelivery" DATETIME,
    "subject" TEXT,
    "emailBody" TEXT,
    "emailBodyHtml" TEXT,
    "rawEmailId" TEXT,
    "deliveryAddress" TEXT,
    "emailStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("carrier", "createdAt", "currency", "deliveryAddress", "emailAccountId", "emailBody", "emailBodyHtml", "estimatedDelivery", "id", "orderDate", "orderNumber", "price", "rawEmailId", "shop", "status", "subject", "trackingNumber", "updatedAt", "userId") SELECT "carrier", "createdAt", "currency", "deliveryAddress", "emailAccountId", "emailBody", "emailBodyHtml", "estimatedDelivery", "id", "orderDate", "orderNumber", "price", "rawEmailId", "shop", "status", "subject", "trackingNumber", "updatedAt", "userId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
