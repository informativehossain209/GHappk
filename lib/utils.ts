/**
 * বাংলা তারিখ ফরম্যাট করে
 * "১৫ মে, শুক্রবার" এই ফরম্যাটে
 */
export function formatBengaliDate(dateStr: string): string {
  // Ensure correct parsing (date-only strings without time)
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('bn-BD', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })
}

/**
 * টাকার পরিমাণ বাংলায় ফরম্যাট করে
 * "৳ ১২,৫৪০" এই ফরম্যাটে
 */
export function formatTaka(amount: number): string {
  if (isNaN(amount)) return '৳ ০'
  return '৳ ' + amount.toLocaleString('bn-BD', { maximumFractionDigits: 0 })
}

/**
 * এই মাসের প্রথম ও শেষ দিন
 * @param monthStartDay - মাসের শুরুর দিন (১ বা ২৬)
 */
export function getMonthRange(monthStartDay: number = 1): { start: string; end: string } {
  const now = new Date()
  let start: Date, end: Date

  if (monthStartDay === 1) {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  } else {
    // ২৬ তারিখ থেকে শুরু
    const day = now.getDate()
    if (day >= monthStartDay) {
      start = new Date(now.getFullYear(), now.getMonth(), monthStartDay)
      end   = new Date(now.getFullYear(), now.getMonth() + 1, monthStartDay - 1)
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 1, monthStartDay)
      end   = new Date(now.getFullYear(), now.getMonth(), monthStartDay - 1)
    }
  }

  return {
    start: start.toISOString().split('T')[0],
    end:   end.toISOString().split('T')[0],
  }
}

/**
 * সংখ্যাকে বাংলা অঙ্কে রূপান্তর করে
 */
export function toBengaliDigits(num: number | string): string {
  return String(num).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[parseInt(d)])
}

/**
 * আজকের তারিখ YYYY-MM-DD ফরম্যাটে
 */
export function today(): string {
  return new Date().toISOString().split('T')[0]
}
