import express, { json, urlencoded, Request } from 'express';
import productsRoutes from './routes/products/index.js';
import authRoutes from './routes/auth/index.js';
// import ordersRoutes from './routes/orders/index.js';


const port = process.env.PORT || 4000;
const app = express();

app.use(urlencoded({ extended: false }));
app.use(
  json()
);

app.use('/products', productsRoutes);
app.use('/auth', authRoutes);
// app.use('/orders', ordersRoutes);

if (process.env.NODE_ENV === 'dev') {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

