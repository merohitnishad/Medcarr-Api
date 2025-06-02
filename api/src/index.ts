import express, { json, urlencoded, Request } from 'express';
import productsRoutes from './routes/products/index.js';
import authRoutes from './routes/auth/index.js';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const port = process.env.PORT || 4000;
const app = express();

// Enable CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Middleware
app.use(urlencoded({ extended: false }));
app.use(json());

// Routes
app.use('/products', productsRoutes);
app.use('/auth', authRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
