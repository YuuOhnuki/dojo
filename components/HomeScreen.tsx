'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Difficulty } from '@/types/typing';

interface HomeScreenProps {
    onSelectSinglePlay: (difficulty: Difficulty, minutes: number) => void;
    onSelectMultiPlay: () => void;
    multiplayerOnline: boolean;
    appVersion: string;
}

/**
 * ホーム画面 / メニュー
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({
    onSelectSinglePlay,
    onSelectMultiPlay,
    multiplayerOnline,
    appVersion,
}) => {
    const [showDifficultySelect, setShowDifficultySelect] = React.useState(false);
    const [selectedMinutes, setSelectedMinutes] = React.useState<number>(1);

    const difficultyOptions: { key: Difficulty; label: string; description: string }[] = [
        { key: 'easy', label: '初級', description: '単語中心' },
        { key: 'medium', label: '中級', description: '文をテンポ良く' },
        { key: 'hard', label: '上級', description: '長文チャレンジ' },
    ];

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
                        <div className="text-center text-sm tracking-wide text-gray-500">難易度・時間を選択</div>
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
            <div className="absolute bottom-6 right-6 text-right text-gray-400 text-xs space-y-1">
                <p className="flex items-center justify-end gap-2">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${multiplayerOnline ? 'bg-emerald-500' : 'bg-red-500'}`}
                    />
                    <span>マルチサーバー: {multiplayerOnline ? 'オンライン' : 'オフライン'}</span>
                </p>
                <p>v{appVersion}</p>
            </div>
        </div>
    );
};
