import { Router, Request, Response } from 'express';
import prisma from '../config/db';

const router = Router();

// Get all products
router.get('/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            include: {
                category: true,
                inventory: true
            }
        });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get product details
// @ts-ignore
router.get('/products/:id', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { product_id: parseInt(req.params.id) },
            include: {
                category: true,
                inventory: true
            }
        });
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Get inventory details
router.get('/inventory/:id', async (req, res) => {
    try {
        const inventory = await prisma.inventory.findMany({
            where: { product_id: parseInt(req.params.id) },
            include: {
                product: true,
                channel: true
            }
        });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

// Update inventory
router.post('/inventory/update', async (req: Request, res: Response) => {
    try {
        const { product_id, channel_id, stock } = req.body;

        // Input validation
        if (!product_id || !channel_id || stock === undefined) {
            return res.status(400).json({ 
                error: 'Missing required fields: product_id, channel_id, stock' 
            });
        }

        // Validate product exists
        const product = await prisma.product.findUnique({
            where: { product_id: parseInt(product_id) }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Validate channel exists
        const channel = await prisma.salesChannel.findUnique({
            where: { channel_id: parseInt(channel_id) }
        });

        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }

        // Update inventory using transaction
        const result = await prisma.$transaction(async (prisma) => {
            const inventory = await prisma.inventory.upsert({
                where: {
                    product_id_channel_id: {
                        product_id: parseInt(product_id),
                        channel_id: parseInt(channel_id)
                    }
                },
                update: {
                    stock: parseInt(stock),
                    last_updated: new Date()
                },
                create: {
                    product_id: parseInt(product_id),
                    channel_id: parseInt(channel_id),
                    stock: parseInt(stock)
                },
                include: {
                    product: {
                        select: {
                            name: true,
                            sku: true
                        }
                    }
                }
            });

            // Create low stock alert if needed
            if (inventory.stock <= product.low_stock_threshold) {
                await prisma.lowStockAlert.create({
                    data: {
                        product_id: parseInt(product_id),
                        current_stock: inventory.stock,
                        threshold: product.low_stock_threshold,
                        alert_status: 'PENDING'
                    }
                });
            }

            return inventory;
        });

        return res.json({
            success: true,
            inventory: result
        });

    } catch (error) {
        console.error('Inventory update error:', error);
        return res.status(500).json({ 
            error: 'Failed to update inventory',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Get low stock alerts`
// @ts-ignore
router.get('/low-stock-alerts', async (req: Request, res: Response) => {
    try {
        const alerts = await prisma.lowStockAlert.findMany({
            where: {
                alert_status: 'Pending',
                current_stock: {
                    lt: prisma.lowStockAlert.fields.threshold
                }
            },
            include: {
                product: {
                    select: {
                        product_id: true,
                        name: true,
                        sku: true,
                        quantity: true,
                        low_stock_threshold: true
                    }
                }
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        if (!alerts.length) {
            return res.json({ 
                message: 'No products below threshold', 
                alerts: [] 
            });
        }

        // Transform the response to include more meaningful information
        const formattedAlerts = alerts.map(alert => ({
            alert_id: alert.alert_id,
            product_name: alert.product.name,
            sku: alert.product.sku,
            current_stock: alert.current_stock,
            threshold: alert.threshold,
            status: alert.alert_status,
            created_at: alert.created_at,
            shortage: alert.threshold - alert.current_stock
        }));

        res.json({
            message: 'Products below threshold found',
            alerts: formattedAlerts
        });
    } catch (error) {
        console.error('Low stock alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch low stock alerts' });
    }
});

// Add new product
router.post('/products', async (req, res) => {
    try {
        const { name, sku, barcode, price, cost_price, quantity, low_stock_threshold, category } = req.body;
        const product = await prisma.product.create({
            data: {
                name,
                sku,
                barcode,
                price,
                category,
                cost_price,
                quantity,
                low_stock_threshold,
            },
        });
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create product' });
    }
});

export default router;