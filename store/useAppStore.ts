import { create } from 'zustand'

interface Profile {
  id: string
  full_name: string
  phone: string
  address: string
  month_start: number
  notif_on: boolean
}

interface AppState {
  // Profile
  profile: Profile | null
  setProfile: (profile: Profile) => void

  // Refresh trigger — increment to force data reload
  refreshTrigger: number
  triggerRefresh: () => void

  // Transaction draft (for quick-add from anywhere)
  draftAmount: string
  setDraftAmount: (amount: string) => void

  // Loading states
  isDashboardLoading: boolean
  setDashboardLoading: (val: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),

  refreshTrigger: 0,
  triggerRefresh: () => set((s) => ({ refreshTrigger: s.refreshTrigger + 1 })),

  draftAmount: '',
  setDraftAmount: (amount) => set({ draftAmount: amount }),

  isDashboardLoading: false,
  setDashboardLoading: (val) => set({ isDashboardLoading: val }),
}))
