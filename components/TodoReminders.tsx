'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase-browser'
import { formatTaka } from '@/lib/utils'
import AddTodoModal from '@/components/AddTodoModal'

interface Todo {
  id: string
  title: string
  reminder_date: string
  reminder_time?: string
  amount?: number
  is_done: boolean
}

interface Props {
  todos: Todo[]
  onRefresh: () => void
}

export default function TodoReminders({ todos, onRefresh }: Props) {
  const supabase = createBrowserClient()
  const [showModal, setShowModal] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  const markDone = async (id: string) => {
    setCompleting(id)
    await supabase.from('todos').update({ is_done: true }).eq('id', id)
    setTimeout(() => { setCompleting(null); onRefresh() }, 400)
  }

  const isToday = (dateStr: string) => dateStr === new Date().toISOString().split('T')[0]
  const isTomorrow = (dateStr: string) => {
    const t = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    return dateStr === t
  }
  const getDateLabel = (dateStr: string) => {
    if (isToday(dateStr)) return '🔴 আজকে'
    if (isTomorrow(dateStr)) return '🟡 আগামীকাল'
    return '📅 ' + new Date(dateStr + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' })
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2 text-sm">📅 আসছে রিমাইন্ডার</h3>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-blue-500 text-xs font-semibold bg-blue-50 px-3 py-1.5 rounded-full active:scale-95 transition-all"
          >＋ যোগ করুন</button>
        </div>

        {todos.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm">কোনো রিমাইন্ডার নেই</p>
            <button onClick={() => setShowModal(true)} className="mt-2 text-blue-500 text-xs underline">
              প্রথম রিমাইন্ডার যোগ করুন
            </button>
          </div>
        ) : (
          <div>
            {todos.map((todo, i) => (
              <div key={todo.id} className={`flex items-center gap-3 px-4 py-3 transition-all ${i < todos.length - 1 ? 'border-b border-gray-50' : ''} ${isToday(todo.reminder_date) ? 'bg-amber-50' : ''} ${completing === todo.id ? 'opacity-40 scale-95' : ''}`}>
                <button onClick={() => markDone(todo.id)} className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 active:border-green-500 active:bg-green-50 transition-all">
                  {completing === todo.id && <span className="text-green-500 text-xs">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">{todo.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {getDateLabel(todo.reminder_date)}
                    {todo.reminder_time && ` • ${todo.reminder_time.slice(0, 5)}`}
                  </p>
                </div>
                {todo.amount && <span className="text-amber-600 text-sm font-medium flex-shrink-0">{formatTaka(todo.amount)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <AddTodoModal isOpen={showModal} onClose={() => setShowModal(false)} onSuccess={onRefresh} />
    </>
  )
}
