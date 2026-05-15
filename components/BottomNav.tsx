'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/dashboard', icon: '🏠', label: 'হোম' },
  { href: '/reports',   icon: '📊', label: 'রিপোর্ট' },
  { href: '/add',       icon: null,  label: 'যোগ করুন', isCenter: true },
  { href: '/budget',    icon: '🎯', label: 'বাজেট' },
  { href: '/settings',  icon: '⚙️', label: 'সেটিংস' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-100 shadow-lg safe-bottom z-50">
      <div className="flex items-center justify-around px-2 h-16">
        {tabs.map(tab => {
          const isActive = pathname === tab.href
          if (tab.isCenter) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center -mt-5"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-2xl transition-all active:scale-95 ${
                  isActive ? 'bg-primary-dark scale-110' : 'bg-primary'
                }`}>
                  ➕
                </div>
                <span className="text-xs text-gray-500 mt-1">{tab.label}</span>
              </Link>
            )
          }
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all active:scale-95 ${
                isActive ? 'text-primary' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className={`text-xs font-medium ${isActive ? 'text-primary' : 'text-gray-400'}`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
