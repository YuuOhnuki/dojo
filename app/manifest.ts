import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'e-typic | タイピング練習',
        short_name: 'e-typic',
        description: 'ローマ字入力を中心に日本語タイピングを練習できるサイトです。',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        lang: 'ja',
        icons: [
            {
                src: '/logo.svg',
                type: 'image/svg+xml',
                sizes: 'any',
                purpose: 'any',
            },
        ],
    };
}
