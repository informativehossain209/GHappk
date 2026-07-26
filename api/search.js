const { supabase, cors, safeErr, str, requireSession } = require('./_lib/db');

// §15 — one endpoint, queries every entity in parallel, LIMIT-ed (never
// fetchAll — search only ever needs "top matches").
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ses = await requireSession(req, res); if (!ses) return;
    const q = str(req.query.q || '');
    if (!q || q.length < 2) return res.json({ ok: true, results: {} });
    const N = 8;

    const [products, customers, suppliers, employees, invoices, expenses] = await Promise.all([
      supabase.from('products').select('id,name,sku,barcode,current_stock,selling_price').eq('tenant_id', ses.tenantId).or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`).limit(N),
      supabase.from('customers').select('id,name,phone').eq('tenant_id', ses.tenantId).or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(N),
      supabase.from('suppliers').select('id,name,phone').eq('tenant_id', ses.tenantId).or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(N),
      supabase.from('staff').select('id,name,role,mobile').eq('tenant_id', ses.tenantId).or(`name.ilike.%${q}%,mobile.ilike.%${q}%`).limit(N),
      supabase.from('transactions').select('invoice_no,date').eq('tenant_id', ses.tenantId).eq('type', 'sale').ilike('invoice_no', `%${q}%`).limit(N),
      supabase.from('exp_records').select('id,amount,note,date').eq('tenant_id', ses.tenantId).ilike('note', `%${q}%`).limit(N)
    ]);

    // Dedup invoice numbers (one invoice = many line rows).
    const invoiceNos = [...new Set((invoices.data || []).map(i => i.invoice_no))].map(no => ({ invoiceNo: no }));

    return res.json({
      ok: true,
      results: {
        products: products.data || [],
        customers: customers.data || [],
        suppliers: suppliers.data || [],
        employees: employees.data || [],
        invoices: invoiceNos,
        expenses: expenses.data || []
      }
    });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
