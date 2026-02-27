import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import sosRoutes from './routes/sosRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(env.clientOrigins);
  const isDev = process.env.NODE_ENV !== 'production';

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    if (!isDev) return false;
    return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  }

  const corsOptions = {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nearhelp-backend' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/sos', sosRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/ai', aiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
