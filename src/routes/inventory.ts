import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { logTransaction } from '../utils/transactionLogger';
import Logger from '../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { v4 as uuidv4 } from 'uuid'; // Add this import
import { generateBarcodeImage } from '../utils/barcodeGenerator';

const router = Router();

// Protect all routes in this router
// router.use(authMiddleware as any);

// At the start of your route handlers, add:
Logger.debug('Inventory routes initialized');

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
// @ts-ignore
router.post('/update', async (req: Request, res: Response) => {
    try {
        const { product_id, channel_id, stock } = req.body;

        // Input validation
        if (!product_id || !channel_id || stock === undefined || stock < 0) {
            return res.status(400).json({ 
                error: 'Invalid input: stock must be non-negative and all fields are required' 
            });
        }

        // Update both inventory and product tables in a transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Update inventory
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
                }
            });

            // Update product quantity
            const product = await prisma.product.update({
                where: { product_id: parseInt(product_id) },
                data: { quantity: parseInt(stock) }
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

            logTransaction.inventoryUpdated(inventory, inventory.stock);
            return { inventory, product };
        });

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logTransaction.error('Update Inventory', error as Error);
        return res.status(500).json({ 
            error: 'Failed to update inventory',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Get low stock alerts
// @ts-ignore
router.get('/low-stock-alerts', async (_req: Request, res: Response) => {
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
        const { 
            name, 
            sku, 
            barcode, 
            price, 
            cost_price, 
            quantity, 
            low_stock_threshold, 
            category_id,
            color,
            material,
            size,
            final_selling_price,
            description,
            variant_1,
            variant_2,
            image_url
        } = req.body;
        
        // Validate required fields
        if (!name || !sku || !price || !cost_price || !quantity || !low_stock_threshold || !category_id) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['name', 'sku', 'price', 'cost_price', 'quantity', 'low_stock_threshold', 'category_id']
            });
        }

        // Generate barcode if not provided
        const generatedBarcode = barcode || uuidv4();
        
        let barcodeImagePath = null;
        let barcodeError = null;
        
        // Try to generate barcode image, but don't fail the whole request if it fails
        try {
            barcodeImagePath = await generateBarcodeImage(generatedBarcode, sku, name);
        } catch (error) {
            console.error('Barcode generation failed:', error);
            barcodeError = error instanceof Error ? error.message : 'Unknown barcode generation error';
            // Continue with product creation even if barcode generation fails
        }

        const product = await prisma.product.create({
            data: {
                name,
                sku,
                barcode: generatedBarcode,
                price: new Decimal(price),
                cost_price: new Decimal(cost_price),
                quantity: parseInt(quantity),
                low_stock_threshold: parseInt(low_stock_threshold),
                category_id: parseInt(category_id),
                color,
                material,
                size,
                final_selling_price: final_selling_price ? new Decimal(final_selling_price) : null,
                description,
                variant_1,
                variant_2,
                image_url: barcodeImagePath // Save barcode image path
            },
            include: {
                category: true
            }
        });
        
        logTransaction.productCreated(product);
        res.status(201).json({
            ...product,
            barcodeUrl: barcodeImagePath ? `${process.env.BASE_URL || 'http://localhost:3000'}${barcodeImagePath}` : null,
            barcodeError: barcodeError
        });
    } catch (error) {
        console.error('Product creation error:', error);
        if ((error as any).code === 'P2002') {
            return res.status(400).json({ 
                error: 'Duplicate entry',
                details: 'SKU or barcode already exists'
            });
        }
        logTransaction.error('Create Product', error as Error);
        res.status(500).json({ 
            error: 'Failed to create product',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;