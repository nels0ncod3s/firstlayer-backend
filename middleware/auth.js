// middleware/auth.js
import { supabase } from '../db.js';
import { hashApiKey, hashSessionToken } from '../crypto.js';

export async function verifyApiKey(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    return reply.status(401).send({ error: 'Missing API Key (x-api-key header required)' });
  }

  const keyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, project_id, is_active')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || !data.is_active) {
    return reply.status(401).send({ error: 'Invalid or revoked API key' });
  }

  request.projectId = data.project_id;
}

// -------------------------------------------------------------
// END-USER AUTH: verifies a session token issued by /v1/auth/login.
// Attaches request.projectId + request.endUserId, both scoped to
// whatever project the session belongs to. Requires x-api-key AND
// x-session-token together — the API key proves which project is
// asking, the session token proves which end-user within it.
// -------------------------------------------------------------
export async function verifySessionToken(request, reply) {
  const rawToken = request.headers['x-session-token'];

  if (!rawToken) {
    return reply.status(401).send({ error: 'Missing session token (x-session-token header required)' });
  }

  const tokenHash = hashSessionToken(rawToken);

  const { data, error } = await supabase
    .from('sessions')
    .select('id, project_id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .single();

  if (error || !data) {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }

  if (new Date(data.expires_at) < new Date()) {
    return reply.status(401).send({ error: 'Session expired' });
  }

  // Cross-check against the API key's project too, so a session token
  // from Project A can't be replayed against Project B's API key.
  if (request.projectId && request.projectId !== data.project_id) {
    return reply.status(401).send({ error: 'Session does not belong to this project' });
  }

  request.projectId = data.project_id;
  request.endUserId = data.user_id;
}

export async function verifyDashboardUser(request, reply) {
  const authHeader = request.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return reply.status(401).send({ error: 'Missing Authorization bearer token' });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }

  const { projectId } = request.params;

  const { data: project, error: projectError } = await supabase
    .from('Projects')
    .select('id, user_id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  request.userId = user.id;
  request.project = project;
}

export async function verifyDashboardSession(request, reply) {
  const authHeader = request.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return reply.status(401).send({ error: 'Missing Authorization bearer token' });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }

  request.userId = user.id;
}