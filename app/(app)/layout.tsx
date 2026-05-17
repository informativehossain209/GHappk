'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/home', icon: '🏠', label: 'হোম' },
  { href: '/reports', icon: '📊', label: 'রিপোর্ট' },
  { href: '/add', icon: '➕', label: 'যোগ করুন', isAction: true, ownerOnly: true },
  { href: '/budget', icon: '💰', label: 'বাজেট', ownerOnly: true },
  { href: '/settings', icon: '⚙️', label: 'সেটিংস' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isViewer, initializeAuth } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    initializeAuth()
  }, [])

  useEffect(() => {
    if (!user) {
      router.replace('/auth/login')
    }
    // Redirect viewers away from write-only pages
    if (isViewer && (pathname === '/add' || pathname === '/budget')) {
      router.replace('/home')
    }
  }, [user, isViewer, router, pathname])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-primary-400 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  const visibleNav = isViewer ? navItems.filter(i => !i.ownerOnly) : navItems

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Viewer mode banner */}
      {isViewer && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-amber-500 text-white text-center text-xs font-semibold py-1.5 flex items-center justify-center gap-2">
          <span>👁️</span>
          <span>ভিউয়ার মোড — শুধু দেখার অনুমতি আছে</span>
        </div>
      )}
      <main className={cn('flex-1 pb-[var(--nav-height)] overflow-auto', isViewer && 'pt-7')}>
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-card border-t border-gray-100 shadow-nav bottom-nav z-50">
        <div className="flex items-center justify-around px-2 pt-2 pb-2">
          {visibleNav.map((item) => {
            const isActive = pathname === item.href
            if (item.isAction) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center -mt-6"
                >
                  <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/40 active:scale-95 transition-all">
                    <span className="text-2xl">➕</span>
                  </div>
                  <span className="text-[10px] mt-1 text-primary-600 font-semibold">{item.label}</span>
                </Link>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center py-1 px-3 rounded-xl transition-all active:scale-95"
              >
                <span className={cn('text-2xl transition-all', isActive ? 'scale-110' : 'opacity-50 grayscale')}>{item.icon}</span>
                <span className={cn('text-[10px] mt-0.5 font-medium', isActive ? 'text-primary-600' : 'text-gray-400')}>{item.label}</span>
                {isActive && <div className="w-1 h-1 rounded-full bg-primary-500 mt-0.5" />}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
