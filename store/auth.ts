'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'

interface AuthState {
  user: User | null
  isViewer: boolean
  viewingUserId: string | null
  setUser: (user: User | null) => void
  setIsViewer: (isViewer: boolean, viewingUserId?: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isViewer: false,
      viewingUserId: null,
      setUser: (user) => set({ user }),
      setIsViewer: (isViewer, viewingUserId) => set({ isViewer, viewingUserId: viewingUserId || null }),
      logout: () => set({ user: null, isViewer: false, viewingUserId: null }),
    }),
    {
      name: 'ghar-khoroch-auth',
    }
  )
)
