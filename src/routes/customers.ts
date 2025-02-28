import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Get all customers
router.get('/', async (req, res) => {
    try {
        const customers = await prisma.customer.findMany();
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

// Create or get customer by phone
router.post('/', async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Name and phone are required' });
        }

        // First try to find existing customer by phone
        let customer = await prisma.customer.findFirst({
            where: { phone }
        });

        // If customer doesn't exist, create new one
        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    name,
                    phone,
                    credit_balance: 0,
                    credit_limit: 0
                }
            });
        }

        res.json(customer);
    } catch (error) {
        console.error('Customer creation error:', error);
        res.status(500).json({ error: 'Failed to create/get customer' });
    }
});

// Get customer by ID
router.get('/:id', async (req, res) => {
    try {
        const customer = await prisma.customer.findUnique({
            where: { customer_id: parseInt(req.params.id) }
        });
        
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer' });
    }
});

// Update customer
router.put('/:id', async (req, res) => {
    try {
        const { name, phone, email } = req.body;
        const customer = await prisma.customer.update({
            where: { customer_id: parseInt(req.params.id) },
            data: { name, phone, email }
        });
        res.json(customer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

export default router; 