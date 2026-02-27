import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';
import { setIo } from './socket/io.js';
import { verifyToken } from './utils/jwt.js';
import { addSocketForUser, removeSocketForUser } from './socket/presence.js';

async function bootstrap() {
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);
  const allowedOrigins = new Set(env.clientOrigins);
  const isDev = process.env.NODE_ENV !== 'production';

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    if (!isDev) return false;
    return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  }

  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
  });

  setIo(io);

  io.on('connection', (socket) => {
    const rawToken = socket.handshake.auth?.token;
    const token = typeof rawToken === 'string' && rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;

    if (token) {
      try {
        const payload = verifyToken(token);
        socket.data.userId = payload.userId;
        addSocketForUser(payload.userId, socket.id);
      } catch {
        // unauthenticated socket can stay connected for public updates
      }
    }

    socket.emit('connected', { id: socket.id, ts: new Date().toISOString() });

    socket.on('disconnect', () => {
      if (socket.data.userId) {
        removeSocketForUser(socket.data.userId, socket.id);
      }
    });
  });

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`NearHelp backend running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
