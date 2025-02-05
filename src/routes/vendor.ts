import { Router } from 'express';
import prisma from '../config/db';

const router = Router();

// Get all vendors
router.get('/', async (req, res) => {
    try {
        const vendors = await prisma.vendor.findMany();
        res.json(vendors);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vendors' });
    }
});

// Get vendor by ID
router.get('/:id', async (req, res) => {
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { vendor_id: parseInt(req.params.id) },
        });
        if (!vendor) {
            return res.status(404).json({ error: 'Vendor not found' });
        }
        res.json(vendor);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vendor' });
    }
});

// Add new vendor
router.post('/add', async (req, res) => {
    try {
        const vendor = await prisma.vendor.create({
            data: {
                name: req.body.name,
                email: req.body.email,
                phone: req.body.phone,
                address: req.body.address,
            },
        });
        res.status(201).json(vendor);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create vendor' });
    }
});

// Update vendor
router.put('/update/:id', async (req, res) => {
    try {
        const vendor = await prisma.vendor.update({
            where: { vendor_id: parseInt(req.params.id) },
            data: req.body,
        });
        res.json(vendor);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update vendor' });
    }
});

// Get vendor transactions
router.get('/transactions/:id', async (req, res) => {
    try {
        const transactions = await prisma.vendorTransaction.findMany({
            where: { vendor_id: parseInt(req.params.id) },
            orderBy: { created_at: 'desc' },
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Record vendor payment
router.post('/payment/:id', async (req, res) => {
    try {
        const { amount, description } = req.body;
        const vendorId = parseInt(req.params.id);

        const [transaction, vendor] = await prisma.$transaction([
            prisma.vendorTransaction.create({
                data: {
                    vendor_id: vendorId,
                    amount,
                    type: 'PAYMENT',
                    description,
                },
            }),
            prisma.vendor.update({
                where: { vendor_id: vendorId },
                data: {
                    balance: {
                        decrement: amount,
                    },
                },
            }),
        ]);

        res.status(201).json({ transaction, vendor });
    } catch (error) {
        res.status(500).json({ error: 'Failed to record payment' });
    }
});

export default router; 