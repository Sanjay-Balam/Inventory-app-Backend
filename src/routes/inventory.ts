import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Get low stock alerts
router.get('/low-stock-alerts', async (req, res) => {
    try {
        const alerts = await prisma.lowStockAlert.findMany({
            where: { alert_status: 'Pending' },
            include: { product: true }
        });
        
        res.json(alerts.map(alert => ({
            product_id: alert.product_id,
            product_name: alert.product.name,
            current_stock: alert.current_stock,
            threshold: alert.threshold
        })));
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update inventory
// @ts-ignore
router.post('/update', async (req, res) => {
    const { product_id, channel_id, stock } = req.body;
    
    try {
        const inventory = await prisma.inventory.upsert({
            where: {
                product_id_channel_id: {
                    product_id,
                    channel_id
                }
            },
            update: { stock },
            create: {
                product_id,
                channel_id,
                stock
            }
        });

        // Check low stock
        const product = await prisma.product.findUnique({
            where: { product_id },
            include: { inventory: true }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const totalStock = product.inventory.reduce((sum, inv) => sum + inv.stock, 0);
        if (totalStock < product.low_stock_threshold) {
            const existingAlerts = await prisma.lowStockAlert.findMany({
                where: { product_id },
            });

            // Check if any alert exists
            const existingAlert = existingAlerts.length > 0 ? existingAlerts[0] : null;

            await prisma.lowStockAlert.upsert({
                where: { alert_id: existingAlert?.alert_id || -1 },
                update: { 
                    current_stock: totalStock,
                    alert_status: 'Pending'
                },
                create: {
                    product_id,
                    current_stock: totalStock,
                    threshold: product.low_stock_threshold
                }
            });
        }

        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;