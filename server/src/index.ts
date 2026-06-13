import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import authRoutes from './routes/auth.js';
import projectsRoutes from './routes/projects.js';
import campaignsRoutes from './routes/campaigns.js';
import analyticsRoutes from './routes/analytics.js';
import collectRoutes from './routes/collect.js';
import genericRoutes from './routes/generic.js';
import functionsRoutes from './routes/functions.js';
import adminRoutes from './routes/admin.js';
import { startCron } from './cron.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: (origin) => origin || '*',
  credentials: true,
  allowMethods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization'],
}));

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.route('/auth', authRoutes);
app.route('/projects', projectsRoutes);
app.route('/campaigns', campaignsRoutes);
app.route('/analytics', analyticsRoutes);
app.route('/collect', collectRoutes);
app.route('/q', genericRoutes);
app.route('/functions', functionsRoutes);
app.route('/admin', adminRoutes);

const port = parseInt(process.env.PORT || '3000', 10);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});

startCron();
