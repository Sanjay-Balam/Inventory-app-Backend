import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

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

export default router; 