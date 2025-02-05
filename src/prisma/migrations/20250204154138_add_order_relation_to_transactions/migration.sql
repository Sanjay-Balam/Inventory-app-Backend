-- AlterTable
ALTER TABLE "Transactions" ADD COLUMN     "order_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Transactions" ADD CONSTRAINT "Transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;
