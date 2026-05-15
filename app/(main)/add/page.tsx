'use client'

import { useRouter } from 'next/navigation'
import TransactionForm from '@/components/TransactionForm'
import { useAppStore } from '@/store/useAppStore'

export default function AddPage() {
  const router = useRouter()
  const { triggerRefresh } = useAppStore()

  const handleSuccess = () => {
    triggerRefresh()
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-primary px-4 pt-12 pb-6">
        <h1 className="text-white text-xl font-bold text-center">💳 লেনদেন যোগ করুন</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <TransactionForm
          onSuccess={handleSuccess}
          onCancel={() => router.back()}
        />
        <div className="h-4" />
      </div>
    </div>
  )
}
