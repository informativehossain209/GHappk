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
  initializeAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isViewer: false,
      viewingUserId: null,

      setUser: (user) => set({ user }),

      setIsViewer: (isViewer, viewingUserId) =>
        set({ isViewer, viewingUserId: viewingUserId || null }),

      // Clears local auth state — no Supabase Auth session involved.
      logout: () => {
        set({ user: null, isViewer: false, viewingUserId: null })
      },

      // User is already restored from persisted zustand state on mount.
      initializeAuth: () => {},
    }),
    {
      name: 'ghar-khoroch-auth',
      partialize: (state) => ({
        user: state.user,
        isViewer: state.isViewer,
        viewingUserId: state.viewingUserId,
      }),
    }
  )
)
