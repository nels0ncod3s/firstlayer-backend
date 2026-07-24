// routes.js
import { supabase } from './db.js';
import { generateApiKey, hashApiKey, hashPassword } from './crypto.js';
import { verifyApiKey, verifyDashboardUser } from './middleware/auth.js';

export async function apiRoutes(fastify, options) {
  // ===============================================================
  // DASHBOARD ROUTES — require a Supabase session (Bearer token),
  // scoped to a project the logged-in user actually owns.
  // ===============================================================

  // Create an API key for a project.
  fastify.post(
    '/api/projects/:projectId/keys',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
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
        .select('id, name, key_hint, created_at, is_active')
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
    }
  );

  // List API keys for a project. Never returns key_hash.
  fastify.get(
    '/api/projects/:projectId/keys',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId } = request.params;

      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_hint, created_at, is_active')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ keys: data });
    }
  );

  // Revoke an API key (soft-delete via is_active — matches the flag
  // verifyApiKey already checks, so a revoked key stops working
  // immediately without losing the audit trail).
  fastify.delete(
    '/api/projects/:projectId/keys/:keyId',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId, keyId } = request.params;

      const { data, error } = await supabase
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId)
        .eq('project_id', projectId)
        .select('id')
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: 'API key not found' });
      }

      return reply.send({ message: 'API key revoked', id: data.id });
    }
  );

  // Cleans up a project's dependent rows (api_keys, project_users) ahead
  // of the dashboard deleting the Projects row itself. The SvelteKit app's
  // own Supabase client is RLS-scoped to Projects only — it was never
  // granted access to these two tables, so this has to happen here with
  // the service-role client instead. Without this, deleting a project
  // would either leave orphaned api_keys/project_users rows behind, or
  // fail outright if a foreign key with no cascade is in place.
  fastify.delete(
    '/api/projects/:projectId',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId } = request.params;

      const { error: keysError } = await supabase.from('api_keys').delete().eq('project_id', projectId);
      if (keysError) {
        return reply.status(500).send({ error: keysError.message });
      }

      const { error: usersError } = await supabase.from('project_users').delete().eq('project_id', projectId);
      if (usersError) {
        return reply.status(500).send({ error: usersError.message });
      }

      return reply.send({ message: 'Project dependents cleaned up' });
    }
  );

  // List a project's end-users for the dashboard (Users page, project
  // overview stats, Logs). Same data as GET /v1/users, but authenticated
  // via the dashboard session instead of x-api-key — the dashboard has
  // a Supabase session, not one of the project's own API keys.
  //
  // Tries to include is_blocked (needed for the Users page's block/unblock
  // action); falls back to a query without it if that column doesn't
  // exist yet, so the page still works either way.
  fastify.get(
    '/api/projects/:projectId/users',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId } = request.params;

      let { data, error } = await supabase
        .from('project_users')
        .select('id, email, created_at, is_blocked')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error && error.code === '42703') {
        ({ data, error } = await supabase
          .from('project_users')
          .select('id, email, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }));
      }

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      return reply.send({ users: data });
    }
  );

  // Delete a single end-user. Dashboard-authenticated counterpart to the
  // public DELETE /v1/users/:id below, for the Users page's delete action.
  fastify.delete(
    '/api/projects/:projectId/users/:userId',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId, userId } = request.params;

      const { data, error } = await supabase
        .from('project_users')
        .delete()
        .eq('id', userId)
        .eq('project_id', projectId)
        .select('id')
        .single();

      if (error || !data) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({ message: 'User deleted', id: data.id });
    }
  );

  // Block/unblock a user. Requires an is_blocked boolean column on
  // project_users (default false) — if it hasn't been added yet, this
  // returns a clear message instead of a raw Postgres error so the
  // frontend can surface something actionable.
  fastify.patch(
    '/api/projects/:projectId/users/:userId/block',
    { preHandler: [verifyDashboardUser] },
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const { blocked } = request.body || {};

      const { data, error } = await supabase
        .from('project_users')
        .update({ is_blocked: !!blocked })
        .eq('id', userId)
        .eq('project_id', projectId)
        .select('id, is_blocked')
        .single();

      if (error) {
        if (error.code === '42703') {
          return reply.status(501).send({
            error:
              "Blocking isn't set up yet. Run this in the Supabase SQL editor first: " +
              'ALTER TABLE project_users ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;'
          });
        }
        return reply.status(500).send({ error: error.message });
      }
      if (!data) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send({
        message: data.is_blocked ? 'User blocked' : 'User unblocked',
        user: data
      });
    }
  );

  // ===============================================================
  // PUBLIC V1 API — CRUD for a project's own end-users. Protected
  // by the project's x-api-key header; verifyApiKey attaches
  // request.projectId, and every query below is scoped to it so one
  // project's key can never read/modify another project's users.
  // ===============================================================

  // Create
  fastify.post('/v1/auth/signup', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const { email, password } = request.body || {};
    const projectId = request.projectId;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase
      .from('project_users')
      .insert({
        project_id: projectId,
        email: email.toLowerCase(),
        password_hash: hashPassword(password),
      })
      .select('id, email, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        return reply.status(400).send({ error: 'User already exists in this project' });
      }
      return reply.status(500).send({ error: error.message });
    }

    return reply.status(201).send({
      message: 'User created successfully',
      user: data,
    });
  });

  // Read (list)
  fastify.get('/v1/users', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const projectId = request.projectId;

    const { data, error } = await supabase
      .from('project_users')
      .select('id, email, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ users: data });
  });

  // Read (one)
  fastify.get('/v1/users/:id', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const projectId = request.projectId;
    const { id } = request.params;

    const { data, error } = await supabase
      .from('project_users')
      .select('id, email, created_at')
      .eq('id', id)
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ user: data });
  });

  // Update
  fastify.patch('/v1/users/:id', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const projectId = request.projectId;
    const { id } = request.params;
    const { email, password } = request.body || {};

    if (!email && !password) {
      return reply.status(400).send({ error: 'Provide at least one of: email, password' });
    }

    const updates = {};
    if (email) updates.email = email.toLowerCase();
    if (password) updates.password_hash = hashPassword(password);

    const { data, error } = await supabase
      .from('project_users')
      .update(updates)
      .eq('id', id)
      .eq('project_id', projectId)
      .select('id, email, created_at')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        return reply.status(400).send({ error: 'Email already in use' });
      }
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ message: 'User updated successfully', user: data });
  });

  // Delete
  fastify.delete('/v1/users/:id', { preHandler: [verifyApiKey] }, async (request, reply) => {
    const projectId = request.projectId;
    const { id } = request.params;

    const { data, error } = await supabase
      .from('project_users')
      .delete()
      .eq('id', id)
      .eq('project_id', projectId)
      .select('id')
      .single();

    if (error || !data) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ message: 'User deleted successfully', id: data.id });
  });
}
