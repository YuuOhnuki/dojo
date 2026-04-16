import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { DotPattern } from '@/components/magicui/dot-pattern';
import { ModeToggle } from '@/components/theme/mode-toggle';
import { ThemeProvider } from '@/components/theme/theme-provider';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

const siteName = 'Typic';
const siteDescription = 'Typicは、ローマ字入力を中心に日本語タイピングを楽しく継続できる練習サイトです。';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    applicationName: siteName,
    title: {
        default: `${siteName} | タイピング練習`,
        template: `%s | ${siteName}`,
    },
    description: siteDescription,
    keywords: ['タイピング', 'タイピング練習', 'ローマ字', '日本語入力', 'e-typic', 'Typic'],
    alternates: {
        canonical: '/',
    },
    openGraph: {
        type: 'website',
        locale: 'ja_JP',
        url: '/',
        title: `${siteName} | タイピング練習`,
        description: siteDescription,
        siteName,
        images: [
            {
                url: '/logo.svg',
                width: 1200,
                height: 630,
                alt: `${siteName} のロゴ`,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: `${siteName} | タイピング練習`,
        description: siteDescription,
        images: ['/logo.svg'],
    },
    icons: {
        icon: '/logo.svg',
        shortcut: '/logo.svg',
        apple: '/logo.svg',
    },
      verification: {
    google: "cGfXYjAEI7nHnWbca1OtL2EO4M5eNlESFJ_G4DND6aQ",
  },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
            <body className="min-h-full flex flex-col relative">
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.98_0.03_260),transparent_45%),radial-gradient(circle_at_bottom_right,oklch(0.96_0.04_190),transparent_50%)] dark:bg-[radial-gradient(circle_at_top,oklch(0.26_0.02_260),transparent_40%),radial-gradient(circle_at_bottom_right,oklch(0.22_0.02_200),transparent_50%)]" />
                        <div className="absolute inset-0 bg-background/45 dark:bg-background/62" />
                        <DotPattern className="[mask-image:radial-gradient(circle_at_center,black,transparent_92%)]" cx={1.1} cy={1.1} cr={1.1} />
                    </div>

                    <div className="relative z-10 flex min-h-full flex-col">
                        <ModeToggle />
                        {children}
                    </div>
                </ThemeProvider>
            </body>
        </html>
    );
}
