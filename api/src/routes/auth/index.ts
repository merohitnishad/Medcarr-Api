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
      const { email } = req.cleanBody;

      // Find user in Cognito user pool by email
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

      // Get all user details from Cognito
      const getUserCmd = new AdminGetUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: cognitoUsername,
      });
      const getUserRes = await cognitoClient.send(getUserCmd);

      // Extract all required attributes from Cognito
      const userAttributes = getUserRes.UserAttributes || [];
      
      const subAttribute = userAttributes.find(attr => attr.Name === "sub");
      const nameAttribute = userAttributes.find(attr => attr.Name === "name");
      const roleAttribute = userAttributes.find(attr => attr.Name === "custom:role");

      if (!subAttribute || !subAttribute.Value) {
        res.status(500).json({ error: "Cognito user has no 'sub' attribute" });
        return;
      }

      const cognitoId = subAttribute.Value; // the unique Cognito sub (UUID)
      const name = nameAttribute?.Value || "";
      const roleFromCognito = roleAttribute?.Value;
      
      // Map role to valid enum values - cast to the expected type
      let role: "admin" | "individual" | "organization" | "healthcare";
      if (roleFromCognito === "admin" || roleFromCognito === "individual" || 
          roleFromCognito === "organization" || roleFromCognito === "healthcare") {
        role = roleFromCognito as "admin" | "individual" | "organization" | "healthcare";
      } else {
        role = "individual"; // default role
      }

      // Check if user already exists in our database
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

      // Insert user with data from Cognito
      const [newUser] = await db
        .insert(users)
        .values({
          cognitoId, // Using camelCase as per your schema
          name,
          email,
          role,
        })
        .returning();

      // Update Cognito user pool with our created user ID
      const updateCmd = new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: cognitoUsername,
        UserAttributes: [
          {
            Name: "custom:userId",
            Value: newUser.id.toString(),
          },
        ],
      });
      await cognitoClient.send(updateCmd);

      res.status(201).json({
        message: "User created successfully",
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
