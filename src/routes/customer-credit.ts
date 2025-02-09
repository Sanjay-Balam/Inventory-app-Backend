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
            }
        });
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});


// Record credit payment
router.post('/payment/:id', async (req, res) => {
    try {
        const { amount, description } = req.body;
        const customerId = parseInt(req.params.id);

        const [transaction, customer] = await prisma.$transaction([
            prisma.customerCreditTransaction.create({
                data: {
                    customer_id: customerId,
                    amount,
                    type: 'PAYMENT',
                    description,
                },
            }),
            prisma.customer.update({
                where: { customer_id: customerId },
                data: {
                    credit_balance: {
                        decrement: amount,
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
router.get('/credit-history/:id', async (req, res) => {
    try {
        const transactions = await prisma.customerCreditTransaction.findMany({
            where: { customer_id: parseInt(req.params.id) },
            orderBy: { created_at: 'desc' },
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch credit history' });
    }
});

export default router; 