'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';

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

interface UserStatsTooltipProps {
    userId: string;
    playerName: string;
    avatar?: string;
    userLevel?: number;
    children: React.ReactNode;
}

const difficultyLabels: { [key: string]: string } = {
    easy: '初級',
    medium: '中級',
    hard: '上級',
    survival: '極限',
};

export const UserStatsTooltip: React.FC<UserStatsTooltipProps> = ({
    userId,
    playerName,
    avatar,
    userLevel,
    children,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = async () => {
        // 既存のhideタイマーをクリア
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }

        setIsVisible(true);

        // 統計情報がまだ取得されていない場合は取得
        if (!stats && !isLoading && !error) {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/user/${userId}/stats`);
                if (response.ok) {
                    const data: UserStats = await response.json();
                    setStats(data);
                    setError('');
                } else {
                    setError('統計情報の取得に失敗しました');
                }
            } catch (err) {
                setError('エラーが発生しました');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        // Triggerの位置を取得してツールチップの位置を計算
        if (triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            const gap = 8; // ギャップ
            const padding = 8; // 画面端のパディング

            // 下に配置できるかチェック
            const spaceBelow = window.innerHeight - triggerRect.bottom;
            const canPlaceBelow = spaceBelow >= tooltipRect.height + gap;

            // 上下の位置を決定
            let top: number;
            if (canPlaceBelow) {
                top = triggerRect.bottom + gap;
            } else {
                top = triggerRect.top - tooltipRect.height - gap;
            }

            // 左位置を決定（トリガー要素の左側に合わせる）
            let left = triggerRect.left;

            // 画面右側からはみ出さないよう調整
            const rightEdge = left + tooltipRect.width;
            if (rightEdge > window.innerWidth - padding) {
                left = window.innerWidth - tooltipRect.width - padding;
            }

            // 画面左側からはみ出さないよう調整
            if (left < padding) {
                left = padding;
            }

            // 上側へのはみ出しを防ぐ
            if (top < padding) {
                top = padding;
            }

            // 下側へのはみ出しを防ぐ
            const bottomEdge = top + tooltipRect.height;
            if (bottomEdge > window.innerHeight - padding) {
                top = window.innerHeight - tooltipRect.height - padding;
            }

            setPosition({ top, left });
        }
    };

    const handleMouseLeave = () => {
        // 100msのディレイを設けて、ツールチップへのマウス移動時間を考慮
        hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
        }, 100);
    };

    const handleTooltipMouseEnter = () => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
    };

    const handleTooltipMouseLeave = () => {
        setIsVisible(false);
    };

    return (
        <div ref={triggerRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {children}

            {isVisible && (
                <div
                    ref={tooltipRef}
                    style={{
                        position: 'fixed',
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        zIndex: 40,
                        pointerEvents: 'auto',
                    }}
                    onMouseEnter={handleTooltipMouseEnter}
                    onMouseLeave={handleTooltipMouseLeave}
                >
                    <Card className="w-80 bg-card border shadow-lg">
                        <div className="p-4 space-y-4">
                            {/* ヘッダー */}
                            <div className="flex items-center gap-2 pb-3 border-b border-border/30">
                                {avatar && <span className="text-2xl">{avatar}</span>}
                                <div className="flex-1">
                                    <h3 className="font-semibold text-sm">{playerName}</h3>
                                    {userLevel !== undefined && (
                                        <p className="text-xs text-muted-foreground">Lv {userLevel}</p>
                                    )}
                                </div>
                            </div>

                            {/* ローディング/エラー状態 */}
                            {isLoading && (
                                <div className="text-center py-4">
                                    <p className="text-xs text-muted-foreground">読み込み中...</p>
                                </div>
                            )}

                            {error && (
                                <div className="text-center py-4">
                                    <p className="text-xs text-red-600">{error}</p>
                                </div>
                            )}

                            {/* スタッツ情報 */}
                            {!isLoading && stats && (
                                <>
                                    {/* 総合統計 */}
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    総ゲーム数
                                                </div>
                                                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                    {stats.totalGames}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground">平均KPM</div>
                                                <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                                                    {stats.averageKpm.toFixed(1)}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground">最高KPM</div>
                                                <div className="text-sm font-bold text-green-600 dark:text-green-400">
                                                    {stats.highestKpm.toFixed(1)}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs font-medium text-muted-foreground">正答率</div>
                                                <div className="text-sm font-bold">
                                                    {(stats.averageCorrectRate * 100).toFixed(1)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 難易度別統計 */}
                                    {stats.difficultyStats.length > 0 && (
                                        <div className="space-y-1 border-t border-border/30 pt-2">
                                            <div className="text-xs font-semibold text-muted-foreground mb-2">
                                                難易度別
                                            </div>
                                            {stats.difficultyStats.map((diff) => (
                                                <div key={diff.difficulty} className="text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            {difficultyLabels[diff.difficulty] || diff.difficulty}
                                                        </span>
                                                        <span className="font-semibold">{diff.games} ゲーム</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
