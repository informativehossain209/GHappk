import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Bengali numeral conversion
const bengaliNumerals = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

export function toBengaliNumber(num: number | string): string {
  return String(num).replace(/[0-9]/g, (d) => bengaliNumerals[parseInt(d)])
}

export function formatCurrency(amount: number): string {
  const formatted = amount.toLocaleString('en-IN')
  return '৳ ' + toBengaliNumber(formatted)
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const bengaliMonths = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
  ]
  const bengaliDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার']
  const day = bengaliDays[date.getDay()]
  const month = bengaliMonths[date.getMonth()]
  const dateNum = toBengaliNumber(date.getDate())
  return `${dateNum} ${month}, ${day}`
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr)
  const bengaliMonths = [
    'জান', 'ফেব', 'মার্চ', 'এপ্র', 'মে', 'জুন',
    'জুল', 'আগ', 'সেপ', 'অক্ট', 'নভে', 'ডিসে'
  ]
  const day = toBengaliNumber(date.getDate())
  const month = bengaliMonths[date.getMonth()]
  return `${day} ${month}`
}

export function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'শুভ সকাল'
  if (hour < 17) return 'শুভ দুপুর'
  if (hour < 20) return 'শুভ বিকেল'
  return 'শুভ সন্ধ্যা'
}

export function hashPin(pin: string): string {
  // Simple hash for demo — in production use bcrypt via edge function
  let hash = 0
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36) + pin.length
}

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
