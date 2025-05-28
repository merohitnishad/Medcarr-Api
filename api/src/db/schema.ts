import * as productsSchema from './schemas/productsSchema.js';
import * as userSchema from './schemas/usersSchema.js';
// import * as orderSchema from './schemas/ordersSchema.js';

export default { ...productsSchema, ...userSchema};
