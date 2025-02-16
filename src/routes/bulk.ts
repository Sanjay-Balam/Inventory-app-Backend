import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

const router = Router();
const prisma = new PrismaClient();

interface StockAdjustment {
    inventory_id: number;
    quantity: number;
    type: 'IN' | 'OUT';
    reason?: string;
}

// Bulk upload products
router.post('/products/upload', async (req, res) => {
    try {
        const products = req.body.products;
        const result = await prisma.product.createMany({
            data: products,
            skipDuplicates: true
        });
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk upload products' });
    }
});

// Bulk update inventory
router.post('/inventory/update', async (req, res) => {
    try {
        const updates = req.body.updates;
        const result = await prisma.$transaction(
            updates.map((update: any) => 
                prisma.inventory.update({
                    where: {
                        inventory_id: update.inventory_id
                    },
                    data: {
                        stock: update.stock
                    }
                })
            )
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to bulk update inventory' });
    }
});

// Stock In/Out endpoint
router.post('/stock-adjust', async (req: Request<{}, {}, StockAdjustment>, res: Response) => {
    try {
        const { inventory_id, quantity, type, reason } = req.body;

        if (!inventory_id || !quantity || !type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const inventory = await prisma.inventory.findUnique({
            where: { inventory_id },
            include: { product: true }
        });

        if (!inventory) {
            return res.status(404).json({ error: 'Inventory not found' });
        }

        // Calculate new stock
        const newStock = type === 'IN' 
            ? inventory.stock + quantity 
            : inventory.stock - quantity;

        if (newStock < 0) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        const result = await prisma.$transaction(async (tx) => {
            // Update inventory
            const updatedInventory = await tx.inventory.update({
                where: { inventory_id },
                data: { 
                    stock: newStock,
                    last_updated: new Date()
                },
                include: {
                    product: {
                        select: {
                            name: true,
                            sku: true,
                            low_stock_threshold: true
                        }
                    }
                }
            });

            // Record stock movement
            await tx.stockMovement.create({
                data: {
                    inventory_id,
                    quantity,
                    type: type === 'IN' ? 'STOCK_IN' : 'STOCK_OUT',
                    reason: reason || `Stock ${type.toLowerCase()}`,
                }
            });

            // Check for low stock alert
            if (newStock <= inventory.product.low_stock_threshold) {
                await tx.lowStockAlert.create({
                    data: {
                        product_id: inventory.product_id,
                        current_stock: newStock,
                        threshold: inventory.product.low_stock_threshold,
                        alert_status: 'PENDING'
                    }
                });
            }

            return updatedInventory;
        });

        return res.json({
            success: true,
            inventory: result
        });

    } catch (error) {
        console.error('Stock adjustment error:', error);
        return res.status(500).json({ error: 'Failed to adjust stock' });
    }
});

export default router;