import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import Decimal from 'decimal.js';

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
        console.log('Received products:', req.body.products); // Debug log

        const products = req.body.products.map((product: any) => {
            console.log('Processing product:', product); // Debug log
            return {
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                price: new Decimal(product.price),
                cost_price: new Decimal(product.cost_price),
                quantity: parseInt(product.quantity),
                low_stock_threshold: parseInt(product.low_stock_threshold),
                category_id: parseInt(product.category_id),
                color: product.color,
                material: product.material,
                size: product.size,
                final_selling_price: product.final_selling_price ? new Decimal(product.final_selling_price) : null,
                description: product.description,
                variant_1: product.variant_1,
                variant_2: product.variant_2
            };
        });

        console.log('Transformed products:', products); // Debug log

        const result = await prisma.product.createMany({
            data: products,
            skipDuplicates: true
        });

        console.log('Prisma result:', result); // Debug log

        res.status(201).json({
            success: true,
            count: result.count,
            message: `Successfully created ${result.count} products`
        });
    } catch (error) {
        console.error('Detailed error:', error); // More detailed error logging
        res.status(500).json({ 
            error: 'Failed to bulk upload products',
            details: error instanceof Error ? error.message : 'Unknown error',
            fullError: JSON.stringify(error, null, 2) // Include full error details
        });
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