'use client';

import React from 'react';
import Image from 'next/image';
import { Home, RotateCcw } from 'lucide-react';
import { GameResult } from '@/types/typing';
import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ResultCardProps {
    result: GameResult;
    accentColor?: string;
    onRestart?: () => void;
    onBackToMenu?: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, accentColor = 'emerald', onRestart, onBackToMenu }) => {
    const formatNumber = (num: number, decimals: number = 2): string => {
        return Number(num.toFixed(decimals)).toString();
    };

    const formatDuration = (milliseconds: number): string => {
        const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const difficultyLabelMap: Record<string, string> = {
        easy: '初級',
        medium: '中級',
        hard: '上級',
        survival: '極限',
    };

    return (
        <div className="h-dvh flex flex-col overflow-hidden animate-fade-up-soft">
            {/* ヘッダー */}
            <div className="flex-shrink-0 p-4 border-b border-border/70">
                <div className="max-w-2xl mx-auto flex text-center items-center">
                    <Image
                        src="/logo.svg"
                        alt="e-typic"
                        width={240}
                        height={76}
                        className="brand-logo h-auto w-[100px] md:w-[120px]"
                    />
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl">
                    <Card className="surface-card">
                        <CardHeader className="border-b border-border/70 pb-4">
                            <CardTitle className="text-2xl font-light">結果</CardTitle>
                            <CardDescription>難易度: {difficultyLabelMap[result.difficulty] ?? result.difficulty}</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-6 pt-6">
                            {/* 主要統計情報 */}
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">KPM</div>
                                    <div className={`text-2xl md:text-3xl font-light text-${accentColor}-500`}>
                                        {formatNumber(result.kpm, 1)}
                                    </div>
                                    <div className="text-xs text-muted-foreground/80">キー/分</div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">正タイプ数</div>
                                    <div className="text-2xl md:text-3xl font-light text-foreground">{result.totalInputCount}</div>
                                    <div className="text-xs text-muted-foreground/80">文字</div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">誤タイプ数</div>
                                    <div className="text-2xl md:text-3xl font-light text-red-500">{result.errorCount}</div>
                                    <div className="text-xs text-muted-foreground/80">個</div>
                                </div>
                            </div>

                            {/* 詳細統計 */}
                            <div className="space-y-3 border-t border-border/70 pt-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">正解率</span>
                                        <span className="font-mono text-base md:text-lg font-semibold text-foreground">
                                            {formatNumber(result.correctRate)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">誤字率</span>
                                        <span className="font-mono text-base md:text-lg font-semibold text-red-500">
                                            {formatNumber(result.errorRate)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">継続時間</span>
                                        <span className="font-mono text-base md:text-lg font-semibold text-foreground">
                                            {formatDuration(result.totalTime)}
                                        </span>
                                    </div>
                                    {typeof result.completedQuestionCount === 'number' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">問題正解数</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-foreground">
                                                {result.completedQuestionCount}
                                            </span>
                                        </div>
                                    )}
                                    {typeof result.maxCombo === 'number' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">最大コンボ</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-amber-500">
                                                {result.maxCombo}
                                            </span>
                                        </div>
                                    )}
                                    {typeof result.reachedPhase === 'number' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">到達フェーズ</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-sky-500">
                                                Phase {result.reachedPhase}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* アクションボタン */}
                            <ActionButtonRow cols={2} className="border-t border-border/70 pt-4">
                                <ActionButton
                                    onClick={onRestart}
                                    icon={RotateCcw}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    もう一度プレイ
                                </ActionButton>
                                <ActionButton onClick={onBackToMenu} variant="outline" icon={Home}>
                                    メニューに戻る
                                </ActionButton>
                            </ActionButtonRow>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};
