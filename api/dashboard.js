const { supabase, cors, safeErr, fetchAll, num, today, requireSession } = require('./_lib/db');

// Mirrors AXIION's `load-all` — one call that returns everything the home
// screen needs, instead of the frontend firing N separate requests.
module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const ses = await requireSession(req, res); if (!ses) return;

    const [salesToday, productsAll, dueRows, lowStockRows] = await Promise.all([
      supabase.from('transactions').select('qty,unit_price,discount,purchase_price,type').eq('tenant_id', ses.tenantId).eq('date', today()),
      fetchAll(() => supabase.from('products').select('current_stock,purchase_price,low_stock_alert').eq('tenant_id', ses.tenantId)),
      fetchAll(() => supabase.from('due_calendar').select('party_type,total_amount,paid_amount,status').eq('tenant_id', ses.tenantId).neq('status', 'cleared')),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', ses.tenantId)
    ]);

    const sales = (salesToday.data || []).filter(t => t.type === 'sale');
    const todaySaleTotal = sales.reduce((s, t) => s + num(t.qty) * num(t.unit_price) - num(t.discount), 0);
    const todayProfit = sales.reduce((s, t) => s + (num(t.unit_price) - num(t.purchase_price)) * num(t.qty) - num(t.discount), 0);

    const stockValue = productsAll.reduce((s, p) => s + num(p.current_stock) * num(p.purchase_price), 0);
    const lowStockCount = productsAll.filter(p => p.low_stock_alert != null && num(p.current_stock) <= num(p.low_stock_alert)).length;

    const customerDue = dueRows.filter(d => d.party_type === 'customer').reduce((s, d) => s + (num(d.total_amount) - num(d.paid_amount)), 0);
    const supplierDue = dueRows.filter(d => d.party_type === 'supplier').reduce((s, d) => s + (num(d.total_amount) - num(d.paid_amount)), 0);

    const { data: closingToday } = await supabase.from('daily_closing').select('status').eq('tenant_id', ses.tenantId).eq('date', today()).maybeSingle();

    const { count: pendingApprovals } = await supabase.from('pending_approvals').select('*', { count: 'exact', head: true }).eq('tenant_id', ses.tenantId).eq('status', 'pending');

    return res.json({
      ok: true,
      role: ses.role,
      today: {
        saleTotal: todaySaleTotal, profit: todayProfit, transactionCount: sales.length
      },
      stockValue, productCount: productsAll.length, lowStockCount,
      customerDue, supplierDue,
      closingStatus: (closingToday && closingToday.status) || 'open',
      pendingApprovals: pendingApprovals || 0,
      tenant: { shopName: ses.tenant.shop_name, category: ses.tenant.category, uiMode: ses.tenant.ui_mode }
    });
  } catch (e) {
    res.json({ ok: false, error: safeErr(e) });
  }
};
