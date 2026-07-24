// middleware/auth.js
import { supabase } from '../db.js';
import { hashApiKey } from '../crypto.js';

export async function verifyApiKey(request, reply) {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    return reply.status(401).send({ error: 'Missing API Key (x-api-key header required)' });
  }

  // Hash incoming raw key to match what is stored in the DB
  const keyHash = hashApiKey(apiKey);

  // Look up key in api_keys table
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, project_id, is_active')
    .eq('key_hash', keyHash)
    .single();

  if (error || !data || !data.is_active) {
    return reply.status(401).send({ error: 'Invalid or revoked API key' });
  }

  // Attach project info directly to the request object for downstream routes
  request.projectId = data.project_id;
}

// -------------------------------------------------------------
// DASHBOARD AUTH: verifies the logged-in Supabase user (the access
// token SvelteKit forwards from the dashboard session) actually
// owns the :projectId in the URL. Without this, anyone who knows
// (or guesses) a project id could mint/list/revoke its API keys.
// -------------------------------------------------------------
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

  // Same "don't leak existence" behavior as the dashboard's own
  // dashboard/[project]/+layout.server.js: wrong owner and
  // nonexistent id both come back as 404, not 403.
  if (projectError || !project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  request.userId = user.id;
  request.project = project;
}