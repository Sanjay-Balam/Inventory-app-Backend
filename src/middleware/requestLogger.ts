import { Request, Response, NextFunction } from 'express';
import Logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.http(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${req.ip}`
        );
    });

    next();
};

export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
    Logger.error(`Error: ${err.message} - Path: ${req.path} - ${err.stack}`);
    next(err);
}; 