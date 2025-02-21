import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
    user?: { userId: number };
}

export const authMiddleware = (
    req: Request, 
    res: Response, 
    next: NextFunction
) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ 
                error: 'Authentication required. Please provide a token.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        (req as AuthRequest).user = decoded as { userId: number };
        next();
    } catch (error) {
        return res.status(401).json({ 
            error: 'Invalid or expired token. Please login again.' 
        });
    }
};
