'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  isViewer: boolean
  viewingUserId: string | null
  setUser: (user: User | null) => void
  setIsViewer: (isViewer: boolean, viewingUserId?: string) => void
  logout: () => Promise<void>
  initializeAuth: () => Promise<void>
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

      // Signs out of Supabase Auth AND clears local state.
      // Always call this instead of manually clearing the store.
      logout: async () => {
        await supabase.auth.signOut()
        set({ user: null, isViewer: false, viewingUserId: null })
      },

      // Called once on app mount (in layout.tsx).
      // Restores the Supabase session that was persisted in localStorage by the
      // Supabase client library, then re-fetches the user profile so the store
      // always holds fresh data (in case name/address was updated on another device).
      initializeAuth: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profile) set({ user: profile })
      },
    }),
    {
      name: 'ghar-khoroch-auth',
      // Only persist user and viewer state.
      // The Supabase Auth session is managed separately by the Supabase client.
      partialize: (state) => ({
        user: state.user,
        isViewer: state.isViewer,
        viewingUserId: state.viewingUserId,
      }),
    }
  )
)
