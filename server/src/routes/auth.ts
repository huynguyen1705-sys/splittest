import { Hono } from 'hono';
import { z } from 'zod';
import { Resend } from 'resend';
import crypto from 'node:crypto';
import { query, one } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, getUserId } from '../auth.js';

const r = new Hono();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const APP_URL = process.env.APP_URL || 'https://splittest.app';
const MAIL_FROM = process.env.MAIL_FROM || 'noreply@splittest.app';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  full_name: z.string().min(1).max(120).optional(),
});

r.post('/signup', async (c) => {
  const parsed = SignupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input', details: parsed.error.flatten() }, 400);
  const { email, password, full_name } = parsed.data;

  const existing = await one(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (existing) return c.json({ error: 'email_taken' }, 409);

  const password_hash = await hashPassword(password);
  const user = await one<{ id: string; email: string }>(
    `INSERT INTO users (email, password_hash, full_name, email_verified)
     VALUES ($1, $2, $3, TRUE) RETURNING id, email`,
    [email.toLowerCase(), password_hash, full_name || null]
  );
  if (!user) return c.json({ error: 'create_failed' }, 500);

  const token = await signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email, full_name: full_name || null } });
});

const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
r.post('/login', async (c) => {
  const parsed = LoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const { email, password } = parsed.data;
  const user = await one<{ id: string; email: string; password_hash: string; full_name: string | null; avatar_url: string | null }>(
    `SELECT id, email, password_hash, full_name, avatar_url FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  if (!user) return c.json({ error: 'invalid_credentials' }, 401);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ error: 'invalid_credentials' }, 401);
  const token = await signToken({ sub: user.id, email: user.email });
  return c.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name, avatar_url: user.avatar_url } });
});

r.get('/me', requireAuth, async (c) => {
  const userId = getUserId(c);
  const user = await one(`SELECT id, email, full_name, avatar_url, created_at FROM users WHERE id = $1`, [userId]);
  if (!user) return c.json({ error: 'not_found' }, 404);
  return c.json({ user });
});

r.post('/logout', requireAuth, async (c) => c.json({ ok: true }));

const ForgotSchema = z.object({ email: z.string().email() });
r.post('/forgot-password', async (c) => {
  const parsed = ForgotSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const email = parsed.data.email.toLowerCase();
  const user = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await query(`UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3`, [token, expires, user.id]);
    if (resend) {
      const link = `${APP_URL}/auth/reset?token=${token}`;
      try {
        await resend.emails.send({
          from: MAIL_FROM,
          to: email,
          subject: 'Reset your SplitTest password',
          html: `<p>Click to reset: <a href="${link}">${link}</a></p><p>Expires in 1 hour.</p>`,
        });
      } catch (e) { console.error('[resend]', e); }
    }
  }
  return c.json({ ok: true });
});

const ResetSchema = z.object({ token: z.string().min(10), password: z.string().min(8) });
r.post('/reset-password', async (c) => {
  const parsed = ResetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const { token, password } = parsed.data;
  const user = await one<{ id: string }>(
    `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires_at > now()`,
    [token]
  );
  if (!user) return c.json({ error: 'invalid_token' }, 400);
  const password_hash = await hashPassword(password);
  await query(
    `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = $2`,
    [password_hash, user.id]
  );
  return c.json({ ok: true });
});

export default r;
