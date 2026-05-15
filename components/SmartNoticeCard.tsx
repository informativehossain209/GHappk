'use client'

import { useState } from 'react'

interface Notice {
  id: string
  message: string
  type: 'info' | 'warning' | 'success'
}

interface Props {
  notices: Notice[]
  onDismiss: (id: string) => void
}

const typeConfig = {
  info:    { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'ℹ️', text: 'text-blue-800' },
  warning: { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: '⚠️', text: 'text-amber-800' },
  success: { bg: 'bg-green-50',  border: 'border-green-200',  icon: '✅', text: 'text-green-800' },
}

export default function SmartNoticeCard({ notices, onDismiss }: Props) {
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)

  const handleDismiss = (id: string) => {
    setDismissing(id)
    setTimeout(() => {
      onDismiss(id)
      setDismissing(null)
      if (current >= notices.length - 1) setCurrent(0)
    }, 300)
  }

  const notice = notices[current]
  if (!notice) return null

  const cfg = typeConfig[notice.type] || typeConfig.info

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between`}>
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          🔔 স্মার্ট নোটিস
        </span>
        {notices.length > 1 && (
          <div className="flex gap-1">
            {notices.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-primary' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className={`${cfg.bg} ${cfg.border} border mx-3 my-3 rounded-xl p-3 flex items-start gap-3 transition-all ${
          dismissing === notice.id ? 'swipe-dismiss' : 'notice-pulse'
        }`}
      >
        <span className="text-xl flex-shrink-0">{cfg.icon}</span>
        <p className={`text-sm ${cfg.text} flex-1 leading-relaxed`}>{notice.message}</p>
        <button
          onClick={() => handleDismiss(notice.id)}
          className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none"
        >
          ×
        </button>
      </div>

      {notices.length > 1 && (
        <div className="flex justify-between px-4 pb-3">
          <button
            onClick={() => setCurrent(p => Math.max(0, p - 1))}
            disabled={current === 0}
            className="text-primary text-xs disabled:text-gray-300"
          >
            ← আগে
          </button>
          <span className="text-gray-400 text-xs">{current + 1} / {notices.length}</span>
          <button
            onClick={() => setCurrent(p => Math.min(notices.length - 1, p + 1))}
            disabled={current === notices.length - 1}
            className="text-primary text-xs disabled:text-gray-300"
          >
            পরে →
          </button>
        </div>
      )}
    </div>
  )
}
