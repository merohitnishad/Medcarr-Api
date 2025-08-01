// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { db } from '../db/index.js'; // Your drizzle db connection
import { users } from '../db/schemas/usersSchema.js'; // Your users table schema
import { eq } from 'drizzle-orm';

// AWS Cognito configuration
const COGNITO_REGION = process.env.COGNITO_REGION || 'eu-west-2'; // Default to eu-west-1 if not set
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_JWKS_URI = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

// JWKS client to get public keys
const client = jwksClient({
  jwksUri: COGNITO_JWKS_URI,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

// Function to get signing key
const getKey = (header: any, callback: any) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
};

// Extended Request interface to include user data
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    sub: string;
    role: string;
    cognitoUsername: string;
  };
}

// Token verification middleware
export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authorization header required with Bearer token' 
      });
    }

    // Extract token (use ID token for user info, access token for API access)
    const token = authHeader.split(' ')[1];

    // Verify JWT token with Cognito public keys
    jwt.verify(token, getKey, {
      audience: process.env.COGNITO_CLIENT_ID, // Your app client ID
      issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`,
      algorithms: ['RS256']
    }, async (err, decoded: any) => {
      if (err) {
        console.error('JWT verification failed:', err);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      try {
        // Extract user info from token
        const cognitoSub = decoded.sub;
        const email = decoded.email;
        const cognitoUsername = decoded['cognito:username'] || decoded.username;

        // Get user from database to fetch role and other info
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.cognitoId, cognitoSub))
          .limit(1);

        if (dbUser.length === 0) {
          return res.status(404).json({ 
            error: 'User not found in database' 
          });
        }

        const user = dbUser[0];

        // Attach user info to request
        req.user = {
          id: user.id,
          email: email,
          sub: cognitoSub,
          role: user.role,
          cognitoUsername: cognitoUsername
        };

        next();
      } catch (dbError) {
        console.error('Database error:', dbError);
        return res.status(500).json({ 
          error: 'Internal server error' 
        });
      }
    });

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};