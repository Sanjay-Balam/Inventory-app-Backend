import Logger from './logger';
import { Order, Product, Inventory, Transaction } from '@prisma/client';

export const logTransaction = {
    orderCreated: (order: Order) => {
        Logger.info(`New order created - OrderID: ${order.order_id}, Amount: ${order.total_amount}`);
    },

    inventoryUpdated: (inventory: Inventory, oldStock: number) => {
        Logger.info(
            `Inventory updated - ProductID: ${inventory.product_id}, ` +
            `Old Stock: ${oldStock}, New Stock: ${inventory.stock}`
        );
    },

    productCreated: (product: Product) => {
        Logger.info(
            `New product created - ProductID: ${product.product_id}, ` +
            `Name: ${product.name}, SKU: ${product.sku}`
        );
    },

    lowStockAlert: (productId: number, currentStock: number, threshold: number) => {
        Logger.warn(
            `Low stock alert - ProductID: ${productId}, ` +
            `Current Stock: ${currentStock}, Threshold: ${threshold}`
        );
    },

    error: (operation: string, error: Error) => {
        Logger.error(`Operation: ${operation} failed - Error: ${error.message}`);
    }
}; 