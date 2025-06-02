import { Router } from 'express';
import {
  createUserSchema,
  loginSchema,
  users,
} from '../../db/schemas/usersSchema.js';
import { validateData } from '../../middlewares/validationMiddleware.js';
import bcrypt from 'bcryptjs';
import { db } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const router = Router();

const generateUserToken = (user: any) => {
  return jwt.sign({ userId: user.id, role: user.role }, 'your-secret', {
    expiresIn: '30d',
  });
};

router.post('/create-user', validateData(createUserSchema), async (req, res) => {
  try {
    const { cognitoId, name, email, role } = req.cleanBody;

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.cognitoId, cognitoId))
      .limit(1);

    if (existingUser.length > 0) {
      res.status(409).json({ 
        error: 'User already exists',
        user: existingUser[0]
      });
      return;
    }

    // Create new user
    const newUser = await db
    .insert(users)
    .values({
      cognitoId,
      name,
      email,
      role,
    })
    .returning();
    
    res.status(201).json({ 
      message: 'User created successfully',
      user: newUser[0]
    });
    return;

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
    return;
  }
});

// router.post('/login', validateData(loginSchema), async (req, res) => {
//   try {
//     const { email, password } = req.cleanBody;

//     const [user] = await db
//       .select()
//       .from(usersTable)
//       .where(eq(usersTable.email, email));
//     if (!user) {
//       res.status(401).json({ error: 'Authentication failed' });
//       return;
//     }

//     const matched = await bcrypt.compare(password, user.password);
//     if (!matched) {
//       res.status(401).json({ error: 'Authentication failed' });
//       return;
//     }

//     // create a jwt token
//     const token = generateUserToken(user);
//     // @ts-ignore
//     delete user.password;
//     res.status(200).json({ token, user });
//   } catch (e) {
//     res.status(500).send('Something went wrong');
//   }
// });

export default router;
