import express from 'express';
import { requestLogger, errorLogger } from './middleware/requestLogger';
import Logger from './utils/logger';
import inventoryRouter from './routes/inventory';
import orderRouter from './routes/orders';
import barcodeRouter from './routes/barcode';
import vendorRouter from './routes/vendor';
import customerCreditRouter from './routes/customer-credit';
import analyticsRouter from './routes/analytics';
import bulkRouter from './routes/bulk';

const app = express();

// Request logging middleware
app.use(requestLogger);

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
app.use('/api/analytics', analyticsRouter);
app.use('/api/bulk', bulkRouter);

// Error logging middleware
app.use(errorLogger);

const PORT = process.env.SERVER_PORT || 3000

app.listen(PORT, () => {
    Logger.info(`Server is running on port ${PORT}`);
});

export default app;