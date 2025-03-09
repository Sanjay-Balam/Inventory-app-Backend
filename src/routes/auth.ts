import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import Logger from '../utils/logger';

const router = Router();

// Environment variables for JWT (make sure to add these to your .env file)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';

// Signup route
// @ts-ignore
router.post('/signup', async (req, res) => {
    try {
        const { username, email, phone, password } = req.body;

        // Check if user already exists (username, email, or phone)
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { name: username },
                    { email },
                    { phone }
                ]
            }
        });

        if (existingUser) {
            // Return specific message based on what field already exists
            if (existingUser.name === username) {
                return res.status(400).json({
                    error: 'Username already exists'
                });
            }
            return res.status(400).json({
                error: 'User already exists with this email or phone'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const user = await prisma.user.create({
            data: {
                name: username,
                email,
                phone,
                password: hashedPassword,
                role: 'user'
            }
        });

        // Return user data without tokens
        res.status(201).json({
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });

    } catch (error) {
        Logger.error(`Signup error: ${error}`);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Login route
// @ts-ignore
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user by username instead of email
        const user = await prisma.user.findFirst({
            where: { name: username }
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generating tokens
        const authToken = jwt.sign(
            { userId: user.user_id },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { userId: user.user_id },
            JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        Logger.info(`User logged in: ${user.name}`);

        // Return user data and tokens with Bearer prefix
        res.json({
            user: {
                id: user.user_id,
                name: user.name,
                email: user.email,
                phone: user.phone
            },
            authToken: `Bearer ${authToken}`,
            refreshToken: `Bearer ${refreshToken}`
        });

    } catch (error) {
        Logger.error(`Login error: ${error}`);
        res.status(500).json({ error: 'Login failed' });
    }
});

export default router; 