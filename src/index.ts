import express from 'express';
import inventoryRouter from './routes/inventory';
import orderRouter from './routes/orders';
import barcodeRouter from './routes/barcode';
import vendorRouter from './routes/vendor';
import customerCreditRouter from './routes/customer-credit';

const app = express();

// Modify the JSON parser to ignore GET requests
app.use((req, res, next) => {
    if (req.method === 'GET') {
        next();
    } else {
        express.json({ limit: '100kb' })(req, res, next);
    }
});

// Keep existing URL encoded config
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Routes
app.use('/api/inventory', inventoryRouter);
app.use('/api/orders', orderRouter);
app.use('/api/barcode', barcodeRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/customers', customerCreditRouter);

const PORT = process.env.SERVER_PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;