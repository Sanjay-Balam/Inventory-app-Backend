import { Router } from 'express';
import { Request, Response } from 'express';
import prisma from '../config/db';

const router = Router();

// Get product by barcode
// @ts-ignore
router.get('/scan/:barcode', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { barcode: req.params.barcode },
            include: { inventory: true }
        });
        
        if (!product) return res.status(404).json({ error: 'Product not found' });
        
        res.json({
            product_id: product.product_id,
            name: product.name,
            price: product.price,
            available_stock: product.inventory.reduce((sum, inv) => sum + inv.stock, 0)
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Process sale via barcode
// @ts-ignore
router.post('/sell/:barcode', async (req, res) => {
    const { channel_id, quantity } = req.body;
    
    try {
        const product = await prisma.product.findUnique({
            where: { barcode: req.params.barcode },
            include: { inventory: { where: { channel_id } } }
        });

        if (!product) return res.status(404).json({ error: 'Product not found' });
        if (!product.inventory[0] || product.inventory[0].stock < quantity) {
            return res.status(400).json({ error: 'Insufficient stock' });
        }

        const transaction = await prisma.$transaction([
            prisma.inventory.update({
                where: { inventory_id: product.inventory[0].inventory_id },
                data: { stock: { decrement: quantity } }
            }),
            prisma.transactions.create({
                data: {
                    product_id: product.product_id,
                    channel_id,
                    transaction_type: 'Sale',
                    quantity
                }
            })
        ]);

        res.json({
            message: 'Sale processed successfully',
            remaining_stock: transaction[0].stock
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;