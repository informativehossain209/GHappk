'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="bn">
      <body className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-5 text-center font-sans">
        <span className="text-5xl mb-4">⚠️</span>
        <h1 className="text-xl font-bold text-gray-800 mb-2">কিছু একটা সমস্যা হয়েছে</h1>
        <p className="text-gray-500 text-sm mb-6">দয়া করে আবার চেষ্টা করুন।</p>
        <button
          onClick={reset}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold"
        >
          আবার চেষ্টা করুন
        </button>
      </body>
    </html>
  )
}
