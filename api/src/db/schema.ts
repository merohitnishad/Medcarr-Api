import * as products from './schemas/productsSchema.js';
import * as users from './schemas/usersSchema.js';
import * as util from './schemas/utilsSchema.js';
// import * as orderSchema from './schemas/ordersSchema.js';

export const schema = {
    ...products,
    ...users,
    ...util,
    // ...orders,
  };