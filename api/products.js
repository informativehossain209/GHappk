const { supabase, cors, safeErr, fetchAll, num, str, requireSession, roleAllowed } = require('./_lib/db');
const { uploadBase64ToStorage, removeFromStorage } = require('./_lib/thumbStorage');
const crypto = require('crypto');

// The app generates every product's scan code itself (no manual typing or
// scanning-in of an existing barcode) — this is what gets printed on the
// QR label, and what the POS scanner resolves back to this exact product.
// Format: DK + 9 random base32-ish digits, e.g. DK482915637 — short enough
// to read/type as a fallback, random enough to not collide within a shop.
async function generateProductBarcode(tenantId) {
  for (let i = 0; i < 5; i++) {
    const code = 'DK' + crypto.randomInt(100000000, 999999999).toString();
    const { data } = await supabase.from('products').select('id').eq('tenant_id', tenantId).eq('barcode', code).maybeSingle();
    if (!data) return code;
  }
  return 'DK' + Date.now(); // astronomically unlikely fallback after 5 collisions
}

// §5 — category → extra fields config. Pure code, no migration needed to
// extend: add a category here and it's immediately available everywhere.
const CATEGORY_FIELDS = {
  'Electronics':   ['Warranty period', 'Serial Number', 'Brand', 'Model'],
  'Mobile Phone':  ['Warranty period', 'IMEI', 'Brand', 'Model'],
  'Pharmacy':      ['Batch Number', 'Expiry Date', 'Manufacturer', 'Dosage'],
  'Grocery':       ['Weight', 'Unit', 'Loose/Packet'],
  'Clothing':      ['Size', 'Color', 'Material'],
  'Hardware':      ['Brand', 'Warranty period'],
  'Cosmetics':     ['Expiry Date', 'Manufacturer'],
  'Gift':          ['Material'],
  'Stationery':    [],
  'Bakery':        ['Expiry Date'],
  'Restaurant':    [],
  'Furniture':     ['Material', 'Warranty period'],
  'Wholesale':     [],
  'Auto Parts':    ['Brand', 'Model', 'Warranty period']
};

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  try {
    if (action === 'category-fields' && req.method === 'GET') {
      return res.json({ ok: true, config: CATEGORY_FIELDS });
    }

    const ses = await requireSession(req, res); if (!ses) return;

    // ── LIST / SEARCH ──────────────────────────────────────────────────
    if (action === 'list' && req.method === 'GET') {
      const q = str(req.query.q || '');
      let query = supabase.from('products').select('*').eq('tenant_id', ses.tenantId).order('name');
      if (q) {
        // §6 — one search box tries barcode/SKU exact match first, falls
        // back to fuzzy name search (handled client-side by trying both).
        query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.eq.${q}`);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      return res.json({ ok: true, products: data || [] });
    }

    // Exact lookup by barcode/QR/SKU — used by the POS scanner (§6/§7).
    if (action === 'lookup' && req.method === 'GET') {
      const code = str(req.query.code || '');
      const { data } = await supabase.from('products').select('*').eq('tenant_id', ses.tenantId)
        .or(`barcode.eq.${code},sku.eq.${code},id.eq.${/^[0-9a-f-]{36}$/i.test(code) ? code : '00000000-0000-0000-0000-000000000000'}`)
        .maybeSingle();
      if (!data) return res.json({ ok: false, error: 'পণ্য পাওয়া যায়নি' });
      return res.json({ ok: true, product: data });
    }

    if (action === 'get' && req.method === 'GET') {
      const { data } = await supabase.from('products').select('*').eq('tenant_id', ses.tenantId).eq('id', req.query.id).maybeSingle();
      if (!data) return res.json({ ok: false, error: 'পণ্য পাওয়া যায়নি' });
      return res.json({ ok: true, product: data });
    }

    // ── LOW STOCK / DEAD STOCK (§8) ─────────────────────────────────────
    if (action === 'low-stock' && req.method === 'GET') {
      const all = await fetchAll(() => supabase.from('products').select('*').eq('tenant_id', ses.tenantId).not('low_stock_alert', 'is', null));
      const low = all.filter(p => num(p.current_stock) <= num(p.low_stock_alert));
      return res.json({ ok: true, products: low });
    }

    if (action === 'dead-stock' && req.method === 'GET') {
      const { data: tenant } = await supabase.from('tenants').select('dead_stock_warn_days,dead_stock_dead_days').eq('id', ses.tenantId).maybeSingle();
      const warnDays = (tenant && tenant.dead_stock_warn_days) || 30;
      const deadDays = (tenant && tenant.dead_stock_dead_days) || 60;
      const all = await fetchAll(() => supabase.from('products').select('*').eq('tenant_id', ses.tenantId));
      const todayMs = Date.now();
      const out = all.map(p => {
        if (!p.last_sale_date) return { ...p, dead_status: p.current_stock > 0 ? 'Dead Stock' : null, days_since_sale: null };
        const days = Math.round((todayMs - new Date(p.last_sale_date + 'T00:00:00Z').getTime()) / 86400000);
        let dead_status = null;
        if (days >= deadDays) dead_status = 'Dead Stock';
        else if (days >= warnDays) dead_status = 'Warning';
        return { ...p, dead_status, days_since_sale: days };
      }).filter(p => p.dead_status);
      return res.json({ ok: true, products: out, warnDays, deadDays });
    }

    // ── STOCK VALUE (§8) — Σ(current_stock × purchase_price), fetchAll'd ─
    if (action === 'stock-value' && req.method === 'GET') {
      const all = await fetchAll(() => supabase.from('products').select('current_stock,purchase_price').eq('tenant_id', ses.tenantId));
      const value = all.reduce((s, p) => s + num(p.current_stock) * num(p.purchase_price), 0);
      return res.json({ ok: true, stockValue: value, productCount: all.length });
    }

    // ── CREATE ───────────────────────────────────────────────────────────
    if (action === 'create' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const d = req.body || {};
      if (!str(d.name)) return res.json({ ok: false, error: 'পণ্যের নাম দিন' });

      // Same product, same name should never get stored more than once —
      // catches double-taps on "পণ্য যোগ করুন" and slow-network retries
      // before they create duplicate rows. Case-insensitive, per tenant.
      const { data: dup } = await supabase.from('products').select('id,name,barcode,selling_price,current_stock')
        .eq('tenant_id', ses.tenantId).ilike('name', str(d.name)).maybeSingle();
      if (dup) return res.json({ ok: false, error: `"${dup.name}" নামে ইতিমধ্যে একটি পণ্য আছে — নতুন করে যোগ না করে সেটি সম্পাদনা করুন`, duplicate: true, product: dup });

      let thumb = '';
      if (d.thumb && d.thumb.startsWith('data:')) thumb = await uploadBase64ToStorage(ses.tenantId, d.thumb);
      else if (d.thumb) thumb = str(d.thumb, 2000);

      const barcode = await generateProductBarcode(ses.tenantId);

      const { data, error } = await supabase.from('products').insert({
        tenant_id: ses.tenantId,
        name: str(d.name), sku: str(d.sku), barcode, category: str(d.category),
        supplier_id: d.supplierId || null,
        purchase_price: num(d.purchasePrice), selling_price: num(d.sellingPrice),
        wholesale_price: d.wholesalePrice != null ? num(d.wholesalePrice) : null,
        minimum_selling_price: d.minimumSellingPrice != null ? num(d.minimumSellingPrice) : null,
        unit: str(d.unit) || 'pcs', case_size: num(d.caseSize) || 1,
        thumb, current_stock: num(d.openingStock),
        storage_location: str(d.storageLocation),
        low_stock_alert: d.lowStockAlert != null ? num(d.lowStockAlert) : null,
        category_fields: d.categoryFields || {}
      }).select().single();
      if (error) {
        if (error.code === '23505') return res.json({ ok: false, error: 'এই নামে ইতিমধ্যে একটি পণ্য আছে', duplicate: true });
        throw error;
      }
      return res.json({ ok: true, product: data });
    }

    // ── UPDATE ───────────────────────────────────────────────────────────
    if (action === 'update' && req.method === 'PUT') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const d = req.body || {};
      const { data: existing } = await supabase.from('products').select('thumb').eq('id', d.id).eq('tenant_id', ses.tenantId).maybeSingle();
      if (!existing) return res.json({ ok: false, error: 'পণ্য পাওয়া যায়নি' });

      if (d.name) {
        const { data: dup } = await supabase.from('products').select('id').eq('tenant_id', ses.tenantId).ilike('name', str(d.name)).neq('id', d.id).maybeSingle();
        if (dup) return res.json({ ok: false, error: 'এই নামে ইতিমধ্যে আরেকটি পণ্য আছে' });
      }

      let thumb = existing.thumb;
      if (d.thumb && d.thumb.startsWith('data:')) {
        if (existing.thumb) removeFromStorage(existing.thumb);
        thumb = await uploadBase64ToStorage(ses.tenantId, d.thumb);
      }

      const patch = { thumb };
      const map = {
        name: 'name', sku: 'sku', barcode: 'barcode', category: 'category',
        supplierId: 'supplier_id', purchasePrice: 'purchase_price', sellingPrice: 'selling_price',
        wholesalePrice: 'wholesale_price', minimumSellingPrice: 'minimum_selling_price',
        unit: 'unit', caseSize: 'case_size', storageLocation: 'storage_location',
        lowStockAlert: 'low_stock_alert', categoryFields: 'category_fields'
      };
      for (const [key, col] of Object.entries(map)) {
        if (d[key] !== undefined) patch[col] = (typeof d[key] === 'number' || col.includes('price') || col === 'case_size' || col === 'low_stock_alert') && d[key] !== null ? num(d[key]) : d[key];
      }
      const { data, error } = await supabase.from('products').update(patch).eq('id', d.id).eq('tenant_id', ses.tenantId).select().single();
      if (error) {
        if (error.code === '23505') return res.json({ ok: false, error: 'এই নামে ইতিমধ্যে একটি পণ্য আছে' });
        throw error;
      }
      return res.json({ ok: true, product: data });
    }

    // Manual stock adjustment (damage found on shelf, recount, etc.) —
    // recorded through the transactions ledger so the stock-delta trigger
    // stays the single source of truth (§4/§11), never a direct UPDATE.
    if (action === 'adjust-stock' && req.method === 'POST') {
      if (!roleAllowed(ses.role, ['owner', 'manager', 'inventory_manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const { productId, delta, reason } = req.body || {};
      const type = num(delta) >= 0 ? 'return' : 'damage';
      const qty = Math.abs(num(delta));
      if (!qty) return res.json({ ok: false, error: 'পরিমাণ দিন' });
      const { error } = await supabase.from('transactions').insert({
        tenant_id: ses.tenantId, type, product_id: productId, qty, cashier_id: ses.staffId
      });
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (action === 'delete' && req.method === 'DELETE') {
      if (!roleAllowed(ses.role, ['owner', 'manager']))
        return res.status(403).json({ ok: false, error: 'অনুমতি নেই' });
      const id = req.query.id || (req.body && req.body.id);
      const { data: existing } = await supabase.from('products').select('thumb').eq('id', id).eq('tenant_id', ses.tenantId).maybeSingle();
      const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', ses.tenantId);
      if (error) throw error;
      if (existing && existing.thumb) removeFromStorage(existing.thumb);
      return res.json({ ok: true });
    }

    res.status(400).json({ ok: false, error: 'অজানা action: ' + action });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
