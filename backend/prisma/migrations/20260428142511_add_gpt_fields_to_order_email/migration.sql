-- AlterTable
ALTER TABLE "OrderEmail" ADD COLUMN "gptCarrier" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptCurrency" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptDeliveryAddress" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptDeliveryStatus" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptEstimatedDelivery" DATETIME;
ALTER TABLE "OrderEmail" ADD COLUMN "gptOrderDate" DATETIME;
ALTER TABLE "OrderEmail" ADD COLUMN "gptOrderNumber" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptPrice" REAL;
ALTER TABLE "OrderEmail" ADD COLUMN "gptShop" TEXT;
ALTER TABLE "OrderEmail" ADD COLUMN "gptTrackingNumber" TEXT;
