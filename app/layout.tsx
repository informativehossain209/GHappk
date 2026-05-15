import type { Metadata } from 'next'
import { Hind_Siliguri } from 'next/font/google'
import './globals.css'

const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-bangla',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ঘর খরচ — আপনার ঘরের হিসাব, আপনার হাতে',
  description: 'বাংলা হাউস এক্সপেন্স ট্র্যাকার',
  manifest: '/manifest.json',
  themeColor: '#1a6fb5',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ঘর খরচ',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="bn">
      <body className={`${hindSiliguri.variable} font-bangla antialiased bg-gray-50`}>
        {children}
      </body>
    </html>
  )
}
