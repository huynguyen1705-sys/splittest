import { Context, MiddlewareHandler } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import { hash, verify } from '@node-rs/argon2';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-production-please');
const TOKEN_TTL = '30d';

export type JwtPayload = {
  sub: string;     // user id
  email: string;
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  try { return await verify(hashed, plain); } catch { return false; }
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch { return null; }
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return c.json({ error: 'unauthorized' }, 401);
  const payload = await verifyToken(m[1]);
  if (!payload) return c.json({ error: 'invalid_token' }, 401);
  c.set('userId', payload.sub);
  c.set('email', payload.email);
  await next();
};

export function getUserId(c: Context): string {
  return c.get('userId') as string;
}
