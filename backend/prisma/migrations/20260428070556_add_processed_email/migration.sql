-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "rawEmailId" TEXT NOT NULL,
    "isOrder" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProcessedEmail_userId_idx" ON "ProcessedEmail"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEmail_userId_rawEmailId_key" ON "ProcessedEmail"("userId", "rawEmailId");
