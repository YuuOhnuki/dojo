'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

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

interface UserStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    playerName: string;
    avatar?: string;
    userLevel?: number;
    userId: string;
}

const difficultyLabels: { [key: string]: string } = {
    easy: '初級',
    medium: '中級',
    hard: '上級',
    survival: '極限',
};

export const UserStatsModal: React.FC<UserStatsModalProps> = ({
    isOpen,
    onClose,
    playerName,
    avatar,
    userLevel,
    userId,
}) => {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        if (!isOpen) return;

        const fetchStats = async () => {
            setIsLoading(true);
            setError('');
            try {
                const response = await fetch(`/api/user/${userId}/stats`);
                if (response.ok) {
                    const data: UserStats = await response.json();
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
    }, [isOpen, userId]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0  border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">{avatar || '😊'}</span>
                        <div>
                            <h2 className="text-2xl font-bold">{playerName}</h2>
                            {userLevel !== undefined && (
                                <p className="text-sm text-gray-600 dark:text-gray-400">Lv {userLevel}</p>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {isLoading && (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-gray-400">読み込み中...</p>
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-12">
                            <p className="text-red-600">{error}</p>
                        </div>
                    )}

                    {!isLoading && stats && (
                        <>
                            {/* 総合統計 */}
                            <div>
                                <h3 className="text-xl font-bold mb-4">総合統計</h3>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            総ゲーム数
                                        </div>
                                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                                            {stats.totalGames}
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            平均KPM
                                        </div>
                                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-300">
                                            {stats.averageKpm.toFixed(1)}
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            最高KPM
                                        </div>
                                        <div className="text-2xl font-bold text-green-600 dark:text-green-300">
                                            {stats.highestKpm.toFixed(1)}
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            正答率
                                        </div>
                                        <div className="text-2xl font-bold text-orange-600 dark:text-orange-300">
                                            {(stats.averageCorrectRate * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            正解数
                                        </div>
                                        <div className="text-xl font-bold">{stats.totalCorrectCount}</div>
                                    </div>

                                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                            誤入力数
                                        </div>
                                        <div className="text-xl font-bold text-red-600">{stats.totalErrorCount}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 難易度別統計 */}
                            {stats.difficultyStats.length > 0 && (
                                <div>
                                    <h3 className="text-xl font-bold mb-4">難易度別統計</h3>

                                    <div className="space-y-3">
                                        {stats.difficultyStats.map((difficulty) => (
                                            <div
                                                key={difficulty.difficulty}
                                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="font-semibold">
                                                        {difficultyLabels[difficulty.difficulty] ||
                                                            difficulty.difficulty}
                                                    </h4>
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                        {difficulty.games} ゲーム
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                            平均KPM
                                                        </div>
                                                        <div className="text-sm font-bold">
                                                            {difficulty.averageKpm.toFixed(1)}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                            最高KPM
                                                        </div>
                                                        <div className="text-sm font-bold text-green-600 dark:text-green-400">
                                                            {difficulty.highestKpm.toFixed(1)}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                            正答率
                                                        </div>
                                                        <div className="text-sm font-bold">
                                                            {(difficulty.averageCorrectRate * 100).toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Card>
        </div>
    );
};
