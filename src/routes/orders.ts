import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Create order
router.post('/create', async (req, res) => {
    const { customer_phone, channel_id, items } = req.body;
    
    try {
        // First find/create customer
        const customer = await prisma.customer.upsert({
            where: { phone: customer_phone },
            update: {},
            create: { phone: customer_phone, name: "New Customer" }
        });

        const order = await prisma.$transaction(async (tx) => {
            // Calculate total and check stock
            let total = 0;
            const orderItems = [];
            
            for (const item of items) {
                const product = await tx.product.findUnique({
                    where: { product_id: item.product_id },
                    include: { inventory: { where: { channel_id } } }
                });

                if (!product) throw new Error(`Product ${item.product_id} not found`);
                if (!product.inventory[0] || product.inventory[0].stock < item.quantity) {
                    throw new Error(`Insufficient stock for product ${product.name}`);
                }

                total += product.price.toNumber() * item.quantity;
                orderItems.push({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: product.price
                });

                await tx.inventory.update({
                    where: { inventory_id: product.inventory[0].inventory_id },
                    data: { stock: { decrement: item.quantity } }
                });
            }

            // Create order
            return await tx.order.create({
                data: {
                    customer: { connect: { customer_id: customer.customer_id } },
                    channel: { connect: { channel_id } },
                    //@ts-ignore
                    user: { connect: { user_id: req.user.user_id } },
                    total_amount: total,
                    orderItems: { create: orderItems },
                    transactions: {
                        create: orderItems.map(item => ({
                            product: { connect: { product_id: item.product_id } },
                            channel: { connect: { channel_id } },
                            transaction_type: 'Sale',
                            quantity: item.quantity
                        }))
                    }
                },
                include: { orderItems: true }
            });
        });

        res.status(201).json(order);
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Order failed' });
    }
});

export default router;