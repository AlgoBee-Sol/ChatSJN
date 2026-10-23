import type { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { UserModel } from './models.js';
import { getAuth, ensureProfile, trustedOrigins } from './auth-engine.js';
import { AppError } from './errors.js';
import type { User } from '@sjn/shared';
// Express exposes its request extension point through this global namespace.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      requestId: string;
    }
  }
}
export function publicUser(u: InstanceType<typeof UserModel>): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    gender: u.gender,
    age: u.age ?? null,
    marja: u.marja,
    language: u.language,
    role: u.role,
    onboardingStep: u.onboardingStep,
    onboardingComplete: u.onboardingComplete,
  };
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  const user = (await UserModel.findById(session.user.id)) || (await ensureProfile(session.user));
  req.user = publicUser(user);
  next();
}
export function authOrigin(req: Request, _res: Response, next: NextFunction) {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !trustedOrigins.includes(req.headers.origin || '')
  )
    throw new AppError(403, 'CSRF', 'Request origin could not be verified.');
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN')
    throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
  next();
}
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!trustedOrigins.includes(req.headers.origin || '') || req.headers['x-sjn-request'] !== '1')
      throw new AppError(403, 'CSRF', 'Request origin could not be verified.');
  }
  next();
}
