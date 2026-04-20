'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft } from 'lucide-react';
import { calculateLevel, type LevelInfo } from '@/lib/level-calculator';

interface UserStats {
    totalGames: number;
    averageKpm: number;
    averageCorrectRate: number;
    highestKpm: number;
    totalCorrectCount: number;
    totalErrorCount: number;
    totalInputCount: number;
    difficultyStats: {
        difficulty: string;
        games: number;
        averageKpm: number;
        averageCorrectRate: number;
        highestKpm: number;
    }[];
}

interface UserStatsScreenProps {
    onCancel?: () => void;
}

const difficultyLabels: { [key: string]: string } = {
    easy: '初級',
    medium: '中級',
    hard: '上級',
    survival: '極限',
};

export const UserStatsScreen: React.FC<UserStatsScreenProps> = ({ onCancel }) => {
    const { data: session } = useSession();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        const fetchStats = async () => {
            if (!session?.user) {
                setError('ログインしてください');
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch('/api/user/stats');
                if (response.ok) {
                    const data: UserStats = await response.json();
                    // レベル情報を計算
                    const level = calculateLevel(data.totalGames, data.averageKpm, data.averageCorrectRate);
                    setLevelInfo(level);
                    setStats(data);
                } else {
                    setError('統計情報の取得に失敗しました');
                }
            } catch (err) {
                setError('エラーが発生しました');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, [session]);

    if (!session?.user) {
        return (
            <Card className="w-full max-w-2xl p-6">
                <p className="text-center">ログインしてください</p>
            </Card>
        );
    }

    if (isLoading) {
        return (
            <Card className="w-full max-w-2xl p-6">
                <p className="text-center">読み込み中...</p>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="w-full max-w-2xl p-6">
                <p className="text-center text-red-600">{error}</p>
            </Card>
        );
    }

    if (!stats) {
        return (
            <Card className="w-full max-w-2xl p-6">
                <p className="text-center">統計情報がありません</p>
            </Card>
        );
    }

    return (
        <div className="w-full max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">マイスタッツ</h1>
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800"
                    ></button>
                )}

                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        <span>戻る</span>
                    </button>
                )}
            </div>

            {/* 総合統計 */}
            <Card className="p-6">
                <h2 className="text-2xl font-bold">総合統計</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">総ゲーム数</div>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{stats.totalGames}</div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">平均KPM</div>
                        <div className="text-3xl font-bold text-purple-600 dark:text-purple-300">
                            {stats.averageKpm.toFixed(1)}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">最高KPM</div>
                        <div className="text-3xl font-bold text-green-600 dark:text-green-300">
                            {stats.highestKpm.toFixed(1)}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">正答率</div>
                        <div className="text-3xl font-bold text-orange-600 dark:text-orange-300">
                            {(stats.averageCorrectRate * 100).toFixed(1)}%
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">正解数</div>
                        <div className="text-2xl font-bold">{stats.totalCorrectCount}</div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400">誤入力数</div>
                        <div className="text-2xl font-bold text-red-600">{stats.totalErrorCount}</div>
                    </div>
                </div>

                {levelInfo && (
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">レベル</div>
                            <div className="text-2xl font-bold">Lv. {levelInfo.currentLevel}</div>
                            <div className="flex justify-between items-center">
                                {' '}
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {100 - levelInfo.experienceToNextLevel} / 100 EXP
                                </span>
                            </div>
                            <Progress value={((100 - levelInfo.experienceToNextLevel) / 100) * 100} className="h-3" />
                        </div>
                    </div>
                )}
            </Card>

            {/* 難易度別統計 */}
            <Card className="p-6">
                <h2 className="text-2xl font-bold">難易度別統計</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.difficultyStats.map((difficulty) => (
                        <div
                            key={difficulty.difficulty}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold">
                                    {difficultyLabels[difficulty.difficulty] || difficulty.difficulty}
                                </h3>
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {difficulty.games} ゲーム
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">平均KPM</div>
                                    <div className="text-lg font-bold">{difficulty.averageKpm.toFixed(1)}</div>
                                </div>

                                <div>
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">最高KPM</div>
                                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                        {difficulty.highestKpm.toFixed(1)}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">正答率</div>
                                    <div className="text-lg font-bold">
                                        {(difficulty.averageCorrectRate * 100).toFixed(1)}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {stats.difficultyStats.length === 0 && (
                        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                            まだゲームをプレイしていません
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};
