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