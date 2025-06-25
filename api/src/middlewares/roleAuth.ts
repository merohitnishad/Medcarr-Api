// middleware/roleAuth.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, verifyToken } from './authMiddleware.js';

// Define your specific roles
export enum UserRole {
  ADMIN = 'admin',
  ORGANIZATION = 'organization', 
  INDIVIDUAL = 'individual',
  HEALTHCARE = 'healthcare'
}

// Role hierarchy mapping (higher roles include lower role permissions)
export const ROLE_HIERARCHY: Record<UserRole, UserRole[]> = {
  [UserRole.ADMIN]: [UserRole.ADMIN, UserRole.ORGANIZATION, UserRole.HEALTHCARE, UserRole.INDIVIDUAL],
  [UserRole.ORGANIZATION]: [UserRole.ORGANIZATION, UserRole.INDIVIDUAL],
  [UserRole.HEALTHCARE]: [UserRole.HEALTHCARE, UserRole.INDIVIDUAL],
  [UserRole.INDIVIDUAL]: [UserRole.INDIVIDUAL]
};

// Generic role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return; // ← ends the middleware without returning the Response object
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        userRole: req.user.role
      });
      return;
    }

    next(); // user is allowed, so proceed
  };
};

// Hierarchical role check (admin can access organization routes, etc.)
export const requireMinimumRole = (minimumRole: UserRole) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role as UserRole;
    const allowedRoles = ROLE_HIERARCHY[userRole] || [];

    if (!allowedRoles.includes(minimumRole)) {
      res.status(403).json({
        error: `Access denied. Minimum role required: ${minimumRole}`,
        userRole: req.user.role
      });
      return;
    }

    next();
  };
};

// Specific role middleware combinations
export const requireAdmin = [verifyToken, requireRole([UserRole.ADMIN])];
export const requireOrganization = [verifyToken, requireRole([UserRole.ADMIN, UserRole.ORGANIZATION])];
export const requireHealthcare = [verifyToken, requireRole([UserRole.ADMIN, UserRole.HEALTHCARE])];
export const requireIndividual = [verifyToken, requireRole([UserRole.ADMIN, UserRole.ORGANIZATION, UserRole.HEALTHCARE, UserRole.INDIVIDUAL])];

// Direct role checks (no hierarchy)
export const adminOnly = [verifyToken, requireRole([UserRole.ADMIN])];
export const organizationOnly = [verifyToken, requireRole([UserRole.ORGANIZATION])];
export const healthcareOnly = [verifyToken, requireRole([UserRole.HEALTHCARE])];
export const individualOnly = [verifyToken, requireRole([UserRole.INDIVIDUAL])];

// Hierarchical middleware (cleaner approach)
export const requireAdminRole = [verifyToken, requireMinimumRole(UserRole.ADMIN)];
export const requireOrganizationRole = [verifyToken, requireMinimumRole(UserRole.ORGANIZATION)];
export const requireHealthcareRole = [verifyToken, requireMinimumRole(UserRole.HEALTHCARE)];
export const requireIndividualRole = [verifyToken, requireMinimumRole(UserRole.INDIVIDUAL)];

// Specific access patterns for your business logic
export const requireOrganizationOrHealthcare = [verifyToken, requireRole([UserRole.ADMIN, UserRole.ORGANIZATION, UserRole.HEALTHCARE])];
export const requireNonIndividual = [verifyToken, requireRole([UserRole.ADMIN, UserRole.ORGANIZATION, UserRole.HEALTHCARE])];
export const requireNonHealthCare = [verifyToken, requireRole([UserRole.ADMIN, UserRole.ORGANIZATION, UserRole.INDIVIDUAL])];
export const requireNonAdmin = [verifyToken, requireRole([UserRole.INDIVIDUAL, UserRole.ORGANIZATION, UserRole.HEALTHCARE])];
export const everyone = [verifyToken, requireRole([UserRole.INDIVIDUAL, UserRole.ORGANIZATION, UserRole.HEALTHCARE, UserRole.ADMIN])];

// Custom role checker function
export const hasRole = (userRole: string, requiredRoles: string[]): boolean => {
  return requiredRoles.includes(userRole);
};

// Check if user has minimum role level
export const hasMinimumRole = (userRole: string, minimumRole: UserRole): boolean => {
  const allowedRoles = ROLE_HIERARCHY[userRole as UserRole] || [];
  return allowedRoles.includes(minimumRole);
};

// Business logic role checkers
export const isAdmin = (userRole: string): boolean => userRole === UserRole.ADMIN;
export const isOrganization = (userRole: string): boolean => userRole === UserRole.ORGANIZATION;
export const isHealthcare = (userRole: string): boolean => userRole === UserRole.HEALTHCARE;
export const isIndividual = (userRole: string): boolean => userRole === UserRole.INDIVIDUAL;

// Check if user can manage other users (admin and organization)
export const canManageUsers = (userRole: string): boolean => {
  return [UserRole.ADMIN, UserRole.ORGANIZATION].includes(userRole as UserRole);
};

// Check if user has healthcare access
export const hasHealthcareAccess = (userRole: string): boolean => {
  return [UserRole.ADMIN, UserRole.HEALTHCARE].includes(userRole as UserRole);
};