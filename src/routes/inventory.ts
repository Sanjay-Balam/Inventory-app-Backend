import { Router } from 'express';
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
router.post('/inventory/update', async (req, res) => {
    try {
        const { product_id, channel_id, stock } = req.body;

        const inventory = await prisma.inventory.upsert({
            where: {
                product_id_channel_id: {
                    product_id: parseInt(product_id),
                    channel_id: parseInt(channel_id)
                }
            },
            update: {
                stock: parseInt(stock)
            },
            create: {
                product_id: parseInt(product_id),
                channel_id: parseInt(channel_id),
                stock: parseInt(stock)
            }
        });

        // Check for low stock alert
        const product = await prisma.product.findUnique({
            where: { product_id: parseInt(product_id) }
        });

        if (product && inventory.stock <= product.low_stock_threshold) {
            await prisma.lowStockAlert.create({
                data: {
                    product_id: parseInt(product_id),
                    current_stock: inventory.stock,
                    threshold: product.low_stock_threshold
                }
            });
        }

        res.json(inventory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inventory' });
    }
});

// Get low stock alerts
router.get('/low-stock-alerts', async (req, res) => {
    try {
        const alerts = await prisma.lowStockAlert.findMany({
            where: {
                alert_status: 'Pending'
            },
            include: {
                product: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch low stock alerts' });
    }
});

// Add new product
router.post('/products', async (req, res) => {
    try {
        const { name, sku, barcode, price, cost_price, quantity, low_stock_threshold } = req.body;

        const product = await prisma.product.create({
            data: {
                name,
                sku,
                barcode,
                price,
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