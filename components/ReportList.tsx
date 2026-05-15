import { formatTaka, formatBengaliDate } from '@/lib/utils'

interface Props {
  transactions: any[]
}

export default function ReportList({ transactions }: Props) {
  // Group by date
  const grouped: Record<string, any[]> = {}
  for (const t of transactions) {
    const d = t.transaction_date
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(t)
  }

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4">
      {dates.map(date => {
        const txns = grouped[date]
        const dayExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        const dayIncome  = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)

        return (
          <div key={date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Date header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{formatBengaliDate(date)}</span>
              <div className="flex gap-3 text-xs">
                {dayIncome  > 0 && <span className="text-green-600 font-medium">+{formatTaka(dayIncome)}</span>}
                {dayExpense > 0 && <span className="text-red-500 font-medium">−{formatTaka(dayExpense)}</span>}
              </div>
            </div>

            {/* Transactions */}
            {txns.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < txns.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-lg flex-shrink-0">
                  {t.categories?.icon || '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">
                    {t.categories?.name || 'অন্যান্য'}
                  </p>
                  {t.note && <p className="text-xs text-gray-400 truncate">{t.note}</p>}
                </div>
                <p className={`text-sm font-bold flex-shrink-0 ${
                  t.type === 'income' ? 'text-green-600' : 'text-red-500'
                }`}>
                  {t.type === 'income' ? '+' : '−'} {formatTaka(Number(t.amount))}
                </p>
              </div>
            ))}

            {/* Day total */}
            {dayExpense > 0 && (
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-500 text-right">
                  দিনের মোট খরচ: <span className="text-red-500 font-semibold">{formatTaka(dayExpense)}</span>
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
