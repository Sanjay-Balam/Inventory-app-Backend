import express from 'express';
import path from 'path';
import { requestLogger, errorLogger } from './middleware/requestLogger';
import Logger from './utils/logger';
import inventoryRouter from './routes/inventory';
import orderRouter from './routes/orders';
import barcodeSimpleRouter from './routes/barcode-simple';
import vendorRouter from './routes/vendor';
import customerCreditRouter from './routes/customer-credit';
import analyticsRouter from './routes/analytics';
import bulkRouter from './routes/bulk';
import authRouter from './routes/auth';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import customerRouter from './routes/customers';
const app = express();

// Request logging middleware
app.use(requestLogger);
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Modify the JSON parser to ignore GET requests
app.use((req, res, next) => {
    if (req.method === 'GET') {
        next();
    } else {
        express.json({ limit: '1000kb' })(req, res, next);
    }
});

// Keep existing URL encoded config
app.use(express.urlencoded({ extended: true, limit: '1000kb' }));

// Public routes (no auth required)
app.use('/api/auth', authRouter);

// Apply auth middleware for all routes after this point
// app.use(authMiddleware as any);

// Protected routes
app.use('/api/inventory', inventoryRouter);
app.use('/api/orders', orderRouter);
app.use('/api/barcode', barcodeSimpleRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/customers', customerRouter);
app.use('/api/customers/credit', customerCreditRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/bulk', bulkRouter);

// Error logging middleware
app.use(errorLogger);

const PORT = process.env.SERVER_PORT || 3000

app.listen(PORT, () => {
    Logger.info(`Server is running on port ${PORT}`);
});

export default app;