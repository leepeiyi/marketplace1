/*
  Warnings:

  - You are about to drop the column `boosted_at` on the `bids` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bids" DROP COLUMN "boosted_at",
ADD COLUMN     "boostedAt" TIMESTAMP(3);
