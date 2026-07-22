// server.js
import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { apiRoutes } from './routes.js';

dotenv.config();

const fastify = Fastify({ logger: true });

// Register CORS for frontend calls
await fastify.register(cors, {
  origin: '*',
});

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register routes
fastify.register(apiRoutes);

const PORT = process.env.PORT || 4000;

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running at http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();