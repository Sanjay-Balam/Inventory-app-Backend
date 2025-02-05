/*
  Warnings:

  - A unique constraint covering the columns `[product_id,channel_id]` on the table `Inventory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Inventory_product_id_channel_id_key" ON "Inventory"("product_id", "channel_id");
