import express, { json, urlencoded, Request } from 'express';
// import productsRoutes from './routes/products/index.js';
import authRoutes from './routes/auth/index.js';
import userIndvidualRoutes from './routes/user/individual/index.js';
import userOrganizationRoutes from './routes/user/organization/index.js';
import userHealthCareRoutes from './routes/user/healthcare/index.js';
import userCommonRoutes from './routes/user/common/index.js';
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

app.use(urlencoded({ extended: true, limit: '50mb' }));
app.use(json({limit: '50mb'}));


// const multer = require('multer');
// const upload = multer({
//   limits: {
//     fileSize: 10 * 1024 * 1024 // 10MB
//   }
// });

// Routes
// app.use('/products', productsRoutes);
app.use('/auth', authRoutes);
app.use('/user/individual', userIndvidualRoutes);
app.use('/user/organization', userOrganizationRoutes);
app.use('/user/healthcare', userHealthCareRoutes);
app.use('/user/common', userCommonRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
