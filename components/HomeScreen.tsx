'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Difficulty } from '@/types/typing';

interface HomeScreenProps {
    onSelectSinglePlay: (difficulty: Difficulty, minutes: number) => void;
    onSelectMultiPlay: () => void;
    appVersion: string;
}

/**
 * ホーム画面 / メニュー
 */
const MULTIPLAYER_SERVER_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';

export const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectSinglePlay, onSelectMultiPlay, appVersion }) => {
    const [showDifficultySelect, setShowDifficultySelect] = React.useState(false);
    const [selectedMinutes, setSelectedMinutes] = React.useState<number>(1);
    const [isServerOnline, setIsServerOnline] = React.useState<boolean | null>(null);

    const difficultyOptions: { key: Difficulty; label: string; description: string }[] = [
        { key: 'easy', label: '初級', description: '単語中心' },
        { key: 'medium', label: '中級', description: '文をテンポ良く' },
        { key: 'hard', label: '上級', description: '長文チャレンジ' },
    ];

    React.useEffect(() => {
        let isUnmounted = false;

        const checkServerHealth = async () => {
            try {
                const response = await fetch(`${MULTIPLAYER_SERVER_URL}/health`, { cache: 'no-store' });
                if (!isUnmounted) {
                    setIsServerOnline(response.ok);
                }
            } catch {
                if (!isUnmounted) {
                    setIsServerOnline(false);
                }
            }
        };

        void checkServerHealth();
        const intervalId = window.setInterval(() => {
            void checkServerHealth();
        }, 15000);

        return () => {
            isUnmounted = true;
            window.clearInterval(intervalId);
        };
    }, []);

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
            {/* ロゴ/タイトル */}
            <div className="text-center mb-16 space-y-4">
                <div className="text-7xl md:text-8xl font-light tracking-wider">DOJO</div>
                <div className="text-gray-500 text-sm tracking-widest">TYPING PRACTICE</div>
            </div>

            {/* ボタングループ */}
            <div className="space-y-4 w-full max-w-sm">
                {!showDifficultySelect ? (
                    <div className="space-y-3">
                        <Button
                            onClick={() => setShowDifficultySelect(true)}
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl"
                            size="lg"
                        >
                            シングルプレイ
                        </Button>
                        <Button
                            onClick={onSelectMultiPlay}
                            variant="outline"
                            className="w-full border-gray-300 text-gray-800 hover:bg-gray-100 rounded-xl"
                            size="lg"
                        >
                            マルチプレイ
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="text-center text-sm tracking-wide text-gray-500">難易度を選択</div>
                        <div className="space-y-2">
                            <div className="rounded-xl border border-gray-200 px-4 py-3 bg-gray-50">
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={selectedMinutes}
                                    onChange={(e) => setSelectedMinutes(Number(e.target.value))}
                                    className="w-full accent-gray-900"
                                    aria-label="プレイ時間"
                                />
                                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                    <span>1分</span>
                                    <span className="font-semibold text-gray-800">{selectedMinutes}分</span>
                                    <span>5分</span>
                                </div>
                            </div>
                        </div>
                        {difficultyOptions.map((option) => (
                            <Button
                                key={option.key}
                                onClick={() => onSelectSinglePlay(option.key, selectedMinutes)}
                                variant="outline"
                                className="w-full border-gray-300 text-gray-800 hover:bg-gray-100 rounded-xl"
                                size="lg"
                            >
                                <span className="font-semibold text-xl">{option.label}</span>
                            </Button>
                        ))}
                        <Button
                            onClick={() => setShowDifficultySelect(false)}
                            variant="ghost"
                            className="w-full text-gray-600 rounded-xl"
                            size="lg"
                        >
                            戻る
                        </Button>
                    </div>
                )}
            </div>

            {/* フッター */}
            <div className="absolute bottom-6 text-center text-gray-400 text-lg">
                <p>&copy; Yuu</p>
            </div>

            <div className="absolute bottom-6 right-6 text-right text-lg text-gray-600">
                <div className="flex items-center gap-2">
                    <span className="font-medium">マルチサーバー:</span>
                    <span className={isServerOnline ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {isServerOnline === null ? '確認中' : isServerOnline ? 'オンライン' : 'オフライン'}
                    </span>
                </div>
                <div className="mt-1">v{appVersion}</div>
            </div>
        </div>
    );
};
