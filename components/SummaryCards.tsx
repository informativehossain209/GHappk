import { formatTaka } from '@/lib/utils'

interface Props {
  income: number
  expense: number
}

export default function SummaryCards({ income, expense }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-green-500">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">💰</span>
          <span className="text-xs text-gray-500">এই মাসে আয়</span>
        </div>
        <p className="text-green-600 text-xl font-bold">{formatTaka(income)}</p>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-red-500">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">💸</span>
          <span className="text-xs text-gray-500">এই মাসে খরচ</span>
        </div>
        <p className="text-red-500 text-xl font-bold">{formatTaka(expense)}</p>
      </div>
    </div>
  )
}
