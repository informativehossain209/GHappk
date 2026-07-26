const crypto = require('crypto');
const { supabase } = require('./db');

const BUCKET = 'thumbs';

// [ADAPT] AXIION's thumbStorage.js — same upload/compress/cleanup logic,
// now namespaced `thumbs/<tenant_id>/<file>.jpg` (§3) so the platform-admin
// dashboard can sum storage per tenant with a simple prefix listing.
function extractStorageKey(url) {
  const marker = `/object/public/${BUCKET}/`;
  const s = String(url || '');
  const idx = s.indexOf(marker);
  if (idx === -1) return null;
  return s.slice(idx + marker.length);
}

async function removeFromStorage(url) {
  const key = extractStorageKey(url);
  if (!key) return;
  try { await supabase.storage.from(BUCKET).remove([key]); } catch (e) { /* ignore */ }
}

// Accepts a "data:image/jpeg;base64,...." string, uploads under the
// tenant's folder, returns a permanent public URL. Also bumps
// tenants.storage_used_bytes so the platform dashboard's 1GB-warning
// widget (§2.1) stays accurate without a separate recount job.
async function uploadBase64ToStorage(tenantId, dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) return '';
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1] || 'jpg';
  const key = `${tenantId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;

  await supabase.from('tenants')
    .update({ storage_used_bytes: (await currentUsage(tenantId)) + buffer.length })
    .eq('id', tenantId);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

async function currentUsage(tenantId) {
  const { data } = await supabase.from('tenants').select('storage_used_bytes').eq('id', tenantId).maybeSingle();
  return (data && data.storage_used_bytes) || 0;
}

// Used by the platform-admin dashboard (§2.1) — sums actual object sizes
// under a tenant's prefix, a source-of-truth cross-check against the
// running counter above.
async function sumTenantStorage(tenantId) {
  const { data, error } = await supabase.storage.from(BUCKET).list(tenantId, { limit: 1000 });
  if (error || !data) return 0;
  return data.reduce((sum, f) => sum + ((f.metadata && f.metadata.size) || 0), 0);
}

module.exports = { uploadBase64ToStorage, removeFromStorage, sumTenantStorage };
