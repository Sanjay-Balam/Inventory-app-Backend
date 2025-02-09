import { Router } from 'express';
import type { Request, Response } from 'express';
import prisma from '../config/db';

const router = Router();

// Get all customers with credit balance
router.get('/credit', async (req, res) => {
    try {
        const customers = await prisma.customer.findMany({
            where: {
                credit_balance: {
                    gt: 0
                }
            },
            select: {
                customer_id: true,
                name: true,
                email: true,
                phone: true,
                credit_balance: true,
                credit_limit: true
            }
        });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Get customer credit details by ID
// @ts-ignore
router.get('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { customer_id: parseInt(req.params.id) },
            select: {
                customer_id: true,
                name: true,
                email: true,
                phone: true,
                credit_balance: true,
                credit_limit: true,
                credit_transactions: {
                    orderBy: {
                        created_at: 'desc'
                    },
                    take: 5 // Get last 5 transactions
                }
            }
        });
        
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Record credit payment
// @ts-ignore
router.post('/payment/:id', async (req, res) => {
    try {
        const { amount, description } = req.body;
        const customerId = parseInt(req.params.id);

        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid payment amount' });
        }

        const [transaction, customer] = await prisma.$transaction([
            prisma.customerCreditTransaction.create({
                data: {
                    customer_id: customerId,
                    amount: parseFloat(amount),
                    type: 'PAYMENT',
                    description,
                },
            }),
            prisma.customer.update({
                where: { customer_id: customerId },
                data: {
                    credit_balance: {
                        decrement: parseFloat(amount),
                    },
                },
            }),
        ]);

        res.status(201).json({ transaction, customer });
    } catch (error) {
        res.status(500).json({ error: 'Failed to record payment' });
    }
});

// Get credit history
// @ts-ignore
router.get('/credit-history/:id', async (req, res) => {
    try {
        const transactions = await prisma.customerCreditTransaction.findMany({
            where: { customer_id: parseInt(req.params.id) },
            include: {
                customer: {
                    select: {
                        name: true,
                        credit_balance: true
                    }
                }
            },
            orderBy: { created_at: 'desc' },
        });
        
        if (!transactions.length) {
            return res.status(404).json({ 
                error: 'No credit history found for this customer' 
            });
        }
        
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch credit history' });
    }
});

// @ts-ignore
router.post('/create', async (req: Request, res: Response) => {
    try {
        const { customer_id, channel_id, items, user_id } = req.body;

        // Input validation
        if (!customer_id || !channel_id || !items || !items.length) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Validate customer exists
        const customer = await prisma.customer.findUnique({
            where: { customer_id: parseInt(customer_id) }
        });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        let total_amount = 0;
        // Validate products and calculate total
        for (const item of items) {
            const product = await prisma.product.findUnique({
                where: { product_id: parseInt(item.product_id) }
            });
            if (!product) {
                return res.status(404).json({ error: `Product ${item.product_id} not found` });
            }
            if (product.quantity < parseInt(item.quantity)) {
                return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
            }
            total_amount += parseFloat(item.price) * parseInt(item.quantity);
        }

        // Create order with transaction
        const order = await prisma.$transaction(async (prisma) => {
            // Create order
            const newOrder = await prisma.order.create({
                data: {
                    customer_id: parseInt(customer_id),
                    channel_id: parseInt(channel_id),
                    total_amount,
                    order_status: 'PENDING',
                    user_id: parseInt(user_id)
                }
            });

            // Create order items and update inventory
            for (const item of items) {
                await prisma.orderItem.create({
                    data: {
                        order_id: newOrder.order_id,
                        product_id: parseInt(item.product_id),
                        quantity: parseInt(item.quantity),
                        price: parseFloat(item.price)
                    }
                });

                // Update product quantity
                await prisma.product.update({
                    where: { product_id: parseInt(item.product_id) },
                    data: {
                        quantity: {
                            decrement: parseInt(item.quantity)
                        }
                    }
                });
            }

            return newOrder;
        });

        console.log('Order created:', order);
        return res.status(201).json(order);
    } catch (error) {
        console.error('Order creation error:', error);
        return res.status(500).json({ error: 'Failed to create order' });
    }
});

export default router;