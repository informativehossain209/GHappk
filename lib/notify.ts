/**
 * JavaScript Bridge — Android WebView notification
 * Android APK-এ window.Android.showNotification() call করে
 * Browser-এ open হলে console-এ দেখাবে
 */
export function sendNativeNotification(title: string, message: string) {
  try {
    if (typeof window !== 'undefined' && (window as any).Android) {
      (window as any).Android.showNotification(title, message)
    } else {
      // Browser fallback: Web Notifications API (if permitted)
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, { body: message, icon: '/icon-192.png' })
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification(title, { body: message, icon: '/icon-192.png' })
            }
          })
        }
      }
      console.log(`[ঘর খরচ নোটিফিকেশন] ${title}: ${message}`)
    }
  } catch (e) {
    console.error('Notification error:', e)
  }
}
