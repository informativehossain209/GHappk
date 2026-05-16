import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-5 text-center">
      <span className="text-6xl mb-4">🏠</span>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">পাতা পাওয়া যায়নি</h1>
      <p className="text-gray-500 text-sm mb-6">আপনি যে পাতাটি খুঁজছেন তা নেই।</p>
      <Link
        href="/home"
        className="bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold active:scale-95 transition-all"
      >
        হোমে ফিরুন
      </Link>
    </div>
  )
}
