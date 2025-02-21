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
import authRouter from './routes/auth';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
const app = express();

// Request logging middleware
app.use(requestLogger);
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:4000",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

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

// Public routes (no auth required)
app.use('/api/auth', authRouter);

// Apply auth middleware for all routes after this point
// app.use(authMiddleware as any);

// Protected routes
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