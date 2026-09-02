import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: 'Ubiqedge | People & Structure',
  description:
    'An editable organizational chart workspace for people, reporting lines, HR validation, and controlled exports.',
  openGraph: {
    title: 'Ubiqedge | People & Structure',
    description: 'A clear view of people, teams, and reporting relationships.',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: 'Ubiqedge — People & Structure',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ubiqedge | People & Structure',
    description: 'An editable, controlled organizational chart workspace.',
    images: ['/og.png'],
  },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
