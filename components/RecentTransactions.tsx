import Link from 'next/link'
import { formatTaka, formatBengaliDate } from '@/lib/utils'

interface Props {
  transactions: any[]
}

export default function RecentTransactions({ transactions }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">সাম্প্রতিক লেনদেন</h3>
        <Link href="/reports" className="text-primary text-sm font-medium">সব দেখুন →</Link>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-gray-400 text-sm">এই মাসে কোনো লেনদেন নেই</p>
          <Link href="/add" className="text-primary text-sm font-medium mt-1 inline-block">
            প্রথম এন্ট্রি করুন →
          </Link>
        </div>
      ) : (
        <div>
          {transactions.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < transactions.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                {t.categories?.icon || '📦'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">
                  {t.categories?.name || 'অন্যান্য'}
                </p>
                <p className="text-gray-400 text-xs">
                  {formatBengaliDate(t.transaction_date)}
                  {t.note && ` • ${t.note}`}
                </p>
              </div>
              <p className={`font-bold text-sm flex-shrink-0 ${
                t.type === 'income' ? 'text-green-600' : 'text-red-500'
              }`}>
                {t.type === 'income' ? '+' : '−'} {formatTaka(Number(t.amount))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
