-- AlterTable
ALTER TABLE "LowStockAlert" ADD COLUMN     "resolved_at" TIMESTAMP(3),
ALTER COLUMN "alert_status" SET DEFAULT 'PENDING';
