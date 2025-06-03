import { Router } from "express";
import {
  createUserSchema,
  loginSchema,
  users,
} from "../../db/schemas/usersSchema.js";
import { validateData } from "../../middlewares/validationMiddleware.js";
import bcrypt from "bcryptjs";
import { db } from "../../db/index.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const router = Router();

const generateUserToken = (user: any) => {
  return jwt.sign({ userId: user.id, role: user.role }, "your-secret", {
    expiresIn: "30d",
  });
};

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

router.post(
  "/create-user",
  validateData(createUserSchema),
  async (req, res) => {
    try {
      const { email, name, role } = req.cleanBody;

      const listCmd = new ListUsersCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Filter: `email = "${email}"`,
        Limit: 1,
      });
      const listRes = await cognitoClient.send(listCmd);

      if (!listRes.Users || listRes.Users.length === 0) {
        res
          .status(404)
          .json({ error: `No Cognito user found with email ${email}` });
        return;
      }

      const cognitoUsername = listRes.Users[0].Username!;

      // Fetch attributes to get the “sub” value explicitly
      const getUserCmd = new AdminGetUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: cognitoUsername,
      });
      const getUserRes = await cognitoClient.send(getUserCmd);

      // Grab the "sub" attribute from Cognito’s response
      const subAttribute = (getUserRes.UserAttributes || []).find(
        (attr) => attr.Name === "sub"
      );
      if (!subAttribute || !subAttribute.Value) {
        res.status(500).json({ error: "Cognito user has no 'sub' attribute" });
        return;
      }
      const cognitoId = subAttribute.Value; // the unique Cognito sub (UUID)

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.cognitoId, cognitoId))
        .limit(1);

      if (existingUser.length > 0) {
        res.status(409).json({
          error: "User already exists in our DB",
          user: existingUser[0],
        });
        return;
      }

      //inster with sub id

      const [newUser] = await db
        .insert(users)
        .values({
          cognitoId, // the “sub” from Cognito
          name,
          email,
          role,
        })
        .returning();

      //updateing created user id with custom:userId in Cognito

      const updateCmd = new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: cognitoUsername, // use the same Username we got above
        UserAttributes: [
          {
            Name: "custom:userId",
            Value: newUser.id.toString(),
          },
        ],
      });
      await cognitoClient.send(updateCmd);

      res.status(201).json({
        message:
          "User created successfully; Cognito updated with custom:userId",
        user: newUser,
      });
      return;
    } catch (error) {
      console.error("Error in /create-user:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  }
);

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
