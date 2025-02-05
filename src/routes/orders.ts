import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Get all orders
router.get('/', async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            include: {
                customer: true,
                channel: true,
                orderItems: {
                    include: {
                        product: true
                    }
                }
            }
        });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Get order details
router.get('/:id', async (req, res) => {
    try {
        const order = await prisma.order.findUnique({
            where: { order_id: parseInt(req.params.id) },
            include: {
                customer: true,
                channel: true,
                orderItems: {
                    include: {
                        product: true
                    }
                }
            }
        });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Create new order
router.post('/create', async (req, res) => {
    try {
        const { customer_id, channel_id, items, user_id } = req.body;

        // Calculate total amount
        let total_amount = 0;
        for (const item of items) {
            const product = await prisma.product.findUnique({
                where: { product_id: item.product_id }
            });
            if (!product) {
                return res.status(404).json({ error: `Product ${item.product_id} not found` });
            }
            total_amount += product.price * item.quantity;
        }

        // Create order with items in a transaction
        const order = await prisma.$transaction(async (prisma) => {
            // Create the order
            const newOrder = await prisma.order.create({
                data: {
                    customer_id: parseInt(customer_id),
                    channel_id: parseInt(channel_id),
                    user_id: parseInt(user_id),
                    total_amount,
                    orderItems: {
                        create: items.map(item => ({
                            product_id: parseInt(item.product_id),
                            quantity: parseInt(item.quantity),
                            price: parseFloat(item.price)
                        }))
                    }
                },
                include: {
                    orderItems: true
                }
            });

            // Update inventory for each item
            for (const item of items) {
                await prisma.inventory.updateMany({
                    where: { 
                        product_id: parseInt(item.product_id),
                        channel_id: parseInt(channel_id)
                    },
                    data: {
                        stock: {
                            decrement: parseInt(item.quantity)
                        }
                    }
                });
            }

            return newOrder;
        });

        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Update order status
router.put('/update/:id', async (req, res) => {
    try {
        const { order_status } = req.body;
        const order = await prisma.order.update({
            where: { order_id: parseInt(req.params.id) },
            data: { order_status }
        });
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Cancel order
router.delete('/cancel/:id', async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        
        await prisma.$transaction(async (prisma) => {
            // Get order details
            const order = await prisma.order.findUnique({
                where: { order_id: orderId },
                include: { orderItems: true }
            });

            if (!order) {
                throw new Error('Order not found');
            }

            // Restore inventory
            for (const item of order.orderItems) {
                await prisma.inventory.updateMany({
                    where: { 
                        product_id: item.product_id,
                        channel_id: order.channel_id
                    },
                    data: {
                        stock: {
                            increment: item.quantity
                        }
                    }
                });
            }

            // Update order status
            await prisma.order.update({
                where: { order_id: orderId },
                data: { order_status: 'Cancelled' }
            });
        });

        res.json({ message: 'Order cancelled successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel order' });
    }
});

export default router;