import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Scan product by barcode
// @ts-ignore
router.get('/scan/:barcode', async (req, res) => {
    try {
        const product = await prisma.product.findFirst({
            where: { barcode: req.params.barcode },
            include: {
                category: true,
                inventory: {
                    include: {
                        channel: true
                    }
                }
            }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to scan product' });
    }
});

// Process sale via barcode
router.post('/sell/:barcode', async (req, res) => {
    try {
        const { quantity, channel_id, customer_id, user_id } = req.body;
        const barcode = req.params.barcode;

        const result = await prisma.$transaction(async (prisma) => {
            // Find product
            const product = await prisma.product.findFirst({
                where: { barcode }
            });

            if (!product) {
                throw new Error('Product not found');
            }

            // Check inventory
            const inventory = await prisma.inventory.findFirst({
                where: {
                    product_id: product.product_id,
                    channel_id: parseInt(channel_id)
                }
            });

            if (!inventory || inventory.stock < parseInt(quantity)) {
                throw new Error('Insufficient stock');
            }

            // Create order
            const order = await prisma.order.create({
                data: {
                    customer_id: parseInt(customer_id),
                    channel_id: parseInt(channel_id),
                    user_id: parseInt(user_id),
                    total_amount: product.price * parseInt(quantity),
                    orderItems: {
                        create: {
                            product_id: product.product_id,
                            quantity: parseInt(quantity),
                            price: product.price
                        }
                    }
                }
            });

            // Update inventory
            await prisma.inventory.update({
                where: { inventory_id: inventory.inventory_id },
                data: {
                    stock: {
                        decrement: parseInt(quantity)
                    }
                }
            });

            // Create transaction record
            const transaction = await prisma.transactions.create({
                data: {
                    product_id: product.product_id,
                    channel_id: parseInt(channel_id),
                    transaction_type: 'SALE',
                    quantity: parseInt(quantity),
                    order_id: order.order_id
                }
            });

            return { order, transaction };
        });

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Failed to process sale'
        });
    }
});

export default router;