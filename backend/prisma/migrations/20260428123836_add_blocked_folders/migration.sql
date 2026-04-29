-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "lastSyncAt" DATETIME,
    "blockedFolders" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EmailAccount" ("createdAt", "email", "id", "imapHost", "imapPort", "lastSyncAt", "passwordEncrypted", "provider", "updatedAt", "userId", "username") SELECT "createdAt", "email", "id", "imapHost", "imapPort", "lastSyncAt", "passwordEncrypted", "provider", "updatedAt", "userId", "username" FROM "EmailAccount";
DROP TABLE "EmailAccount";
ALTER TABLE "new_EmailAccount" RENAME TO "EmailAccount";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
