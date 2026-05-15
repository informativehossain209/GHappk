'use client'

import { formatTaka } from '@/lib/utils'

interface Props {
  profile: { full_name: string }
  balance: number
}

const greetings = () => {
  const h = new Date().getHours()
  if (h < 12) return 'আস্সালামু আলাইকুম'
  if (h < 17) return 'শুভ বিকেল'
  return 'শুভ সন্ধ্যা'
}

export default function BalanceHeader({ profile, balance }: Props) {
  const firstName = profile?.full_name?.split(' ')[0] || 'বন্ধু'
  const isNegative = balance < 0

  return (
    <div className="bg-gradient-to-br from-primary to-primary-dark px-4 pt-12 pb-10">
      {/* Greeting */}
      <p className="text-blue-200 text-sm">{greetings()},</p>
      <h2 className="text-white text-xl font-semibold mt-0.5">
        {firstName} {profile?.full_name?.includes('সাহেব') ? '' : 'সাহেব'}
      </h2>

      {/* Balance */}
      <div className="mt-5 text-center">
        <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">বর্তমান ব্যালেন্স</p>
        <p className={`text-4xl font-bold ${isNegative ? 'text-red-300' : 'text-white'}`}>
          {formatTaka(Math.abs(balance))}
          {isNegative && <span className="text-red-300 text-2xl ml-1">(ঘাটতি)</span>}
        </p>
      </div>

      {/* Month label */}
      <p className="text-blue-300 text-xs text-center mt-2">
        {new Date().toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}
