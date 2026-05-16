export type TransactionType = 'income' | 'expense'
export type PermissionType = 'view'

export interface User {
  id: string
  name: string
  phone: string
  pin: string
  address?: string
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  icon: string
  type: TransactionType
  is_default: boolean
  color?: string
}

export interface Transaction {
  id: string
  user_id: string
  type: TransactionType
  category_id: string
  amount: number
  note?: string
  date: string
  created_at: string
  category?: Category
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  monthly_limit: number
  month: string
  category?: Category
}

export interface Notice {
  id: string
  user_id: string
  message: string
  type: 'info' | 'warning' | 'success' | 'alert'
  is_read: boolean
  created_at: string
}

export interface Todo {
  id: string
  user_id: string
  title: string
  date: string
  time?: string
  amount?: number
  completed: boolean
}

export interface SharedAccess {
  id: string
  owner_user_id: string
  viewer_user_id: string
  permission: PermissionType
}

export interface MonthSummary {
  income: number
  expense: number
  savings: number
}
