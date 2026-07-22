// routes.js
import { supabase } from './db.js';
import { generateApiKey, hashApiKey } from './crypto.js';
import { verifyApiKey } from './middleware/auth.js';

export async function apiRoutes(fastify, options) {
  
  // -------------------------------------------------------------
  // DASHBOARD ROUTE: Generate API Key for a Project
  // -------------------------------------------------------------
  fastify.post('/api/Projects/:projectId/keys', async (request, reply) => {
    const { projectId } = request.params;
    const { name } = request.body || {};

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyHint = `${rawKey.slice(0, 11)}...${rawKey.slice(-4)}`; // e.g. fl_live_8f3a...9a12

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        project_id: projectId,
        key_hash: keyHash,
        key_hint: keyHint,
        name: name || 'Default Key',
      })
      .select('id, name, key_hint, created_at')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    // IMPORTANT: Return rawKey ONCE here. Frontend displays it to dev to copy.
    return reply.status(201).send({
      message: 'API Key generated successfully. Save this key, you will not see it again!',
      apiKey: rawKey,
      keyDetails: data,
    });
  });

  // -------------------------------------------------------------
  // PUBLIC V1 ROUTE: End-User Sign Up (For customer apps)
  // Protected by x-api-key header
  // -------------------------------------------------------------
  fastify.post('/v1/auth/signup', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const { email, password } = request.body || {};
    const projectId = request.projectId; // Attached by middleware

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    // Insert user into project_users table under this specific project
    const { data, error } = await supabase
      .from('project_users')
      .insert({
        project_id: projectId,
        email: email.toLowerCase(),
        password_hash: password, // Note: In production, hash password using bcrypt/argon2 first
      })
      .select('id, email, created_at')
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return reply.status(400).send({ error: 'User already exists in this project' });
      }
      return reply.status(500).send({ error: error.message });
    }

    return reply.status(201).send({
      message: 'User created successfully',
      user: data,
    });
  });
}