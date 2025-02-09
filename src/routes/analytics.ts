import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Get sales performance
router.get('/sales', async (req, res) => {
    try {
        const sales = await prisma.order.groupBy({
            by: ['channel_id'],
            _sum: {
                total_amount: true
            },
            _count: true
        });
        res.json(sales);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sales analytics' });
    }
});

// Get best-selling products
router.get('/best-sellers', async (req, res) => {
    try {
        const bestSellers = await prisma.orderItem.groupBy({
            by: ['product_id'],
            _sum: {
                quantity: true
            },
            orderBy: {
                _sum: {
                    quantity: 'desc'
                }
            },
            take: 10
        });
        res.json(bestSellers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch best sellers' });
    }
});

// Get revenue trends
router.get('/revenue', async (req, res) => {
    try {
        const revenue = await prisma.order.groupBy({
            by: ['created_at'],
            _sum: {
                total_amount: true
            },
            orderBy: {
                created_at: 'desc'
            },
            take: 30
        });
        res.json(revenue);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch revenue trends' });
    }
});

export default router; 