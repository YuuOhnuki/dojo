'use client';

import React from 'react';
import Image from 'next/image';
import { Home, RotateCcw, Save } from 'lucide-react';
import { DifficultyLeaderboardEntry, GameResult } from '@/types/typing';
import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from 'next-auth/react';

interface ResultCardProps {
    result: GameResult;
    leaderboard?: DifficultyLeaderboardEntry[];
    accentColor?: string;
    isSavingName?: boolean;
    isSavedName?: boolean;
    saveErrorMessage?: string;
    isLoadingLeaderboard?: boolean;
    levelInfo?: {
        previousLevel: number;
        currentLevel: number;
        leveledUp: boolean;
    } | null;
    onSavePlayerName?: (playerName: string) => void;
    onRestart?: () => void;
    onBackToMenu?: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({
    result,
    leaderboard = [],
    accentColor = 'emerald',
    isSavingName = false,
    isSavedName = false,
    saveErrorMessage,
    isLoadingLeaderboard = false,
    levelInfo = null,
    onSavePlayerName,
    onRestart,
    onBackToMenu,
}) => {
    const [playerName, setPlayerName] = React.useState(result.playerName || 'Player');
    const displayedLeaderboard = leaderboard.slice(0, 5);
    const { data: session } = useSession();

    React.useEffect(() => {
        setPlayerName(result.playerName || 'Player');
    }, [result.playerName]);

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

    const handleSave = () => {
        if (!onSavePlayerName || isSavedName) return;
        onSavePlayerName(playerName.trim().slice(0, 24) || 'Player');
    };

    return (
        <div className="h-dvh flex flex-col overflow-hidden animate-fade-up-soft">
            {/* ヘッダー */}
            <div className="flex-shrink-0 p-3 border-b border-border/70">
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
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
                <div className="w-full max-w-2xl mx-auto">
                    <Card className="surface-card">
                        <CardHeader className="border-b border-border/70 pb-3">
                            <CardTitle className="text-2xl font-light">結果</CardTitle>
                            <CardDescription>
                                難易度: {difficultyLabelMap[result.difficulty] ?? result.difficulty}
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4">
                            {session?.user && session.user.username && (
                                <div className="space-y-2 rounded border border-border/70 p-3">
                                    <div className="text-sm text-muted-foreground">ユーザー名</div>
                                    <div className="flex flex-col gap-2 md:flex-row">
                                        <input
                                            value={playerName}
                                            onChange={(e) => setPlayerName(e.target.value)}
                                            maxLength={24}
                                            className="surface-input w-full px-3 py-2"
                                            placeholder="ユーザー名を入力"
                                        />
                                        <ActionButton
                                            onClick={handleSave}
                                            icon={Save}
                                            className="w-full md:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                                            disabled={isSavingName || isSavedName}
                                        >
                                            {isSavingName ? '保存中...' : isSavedName ? '保存済み' : 'この名前で保存'}
                                        </ActionButton>
                                    </div>
                                    {saveErrorMessage && <div className="text-xs text-red-600">{saveErrorMessage}</div>}
                                </div>
                            )}

                            {/* レベルアップ通知 */}
                            {levelInfo?.leveledUp && (
                                <div className="rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 p-4 animate-pulse">
                                    <div className="text-center space-y-2">
                                        <div className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                            ✨ レベルアップ！✨
                                        </div>
                                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-300">
                                            Lv {levelInfo.previousLevel} → Lv {levelInfo.currentLevel}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 主要統計情報 */}
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">KPM</div>
                                    <div className={`text-2xl md:text-3xl font-light text-${accentColor}-500`}>
                                        {formatNumber(result.kpm, 1)}
                                    </div>
                                    <div className="text-xs text-muted-foreground/80">キー/分</div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">
                                        正タイプ数
                                    </div>
                                    <div className="text-2xl md:text-3xl font-light text-foreground">
                                        {result.totalInputCount}
                                    </div>
                                    <div className="text-xs text-muted-foreground/80">文字</div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">
                                        誤タイプ数
                                    </div>
                                    <div className="text-2xl md:text-3xl font-light text-red-500">
                                        {result.errorCount}
                                    </div>
                                    <div className="text-xs text-muted-foreground/80">個</div>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm text-muted-foreground uppercase tracking-wide">正解率</div>
                                    <div className="text-2xl md:text-3xl font-light text-green-500">
                                        {formatNumber(result.correctRate, 1)}
                                    </div>
                                    <div className="text-xs text-muted-foreground/80">%</div>
                                </div>
                            </div>

                            {/* 詳細統計 */}
                            <div className="space-y-2 border-t border-border/70 pt-4">
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
                                    {result.difficulty === 'survival' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">継続時間</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-foreground">
                                                {formatDuration(result.totalTime)}
                                            </span>
                                        </div>
                                    )}
                                    {typeof result.dbRank === 'number' && result.dbRank > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">難易度別順位</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-indigo-500">
                                                {result.dbRank} 位
                                            </span>
                                        </div>
                                    )}
                                    {typeof result.completedQuestionCount === 'number' &&
                                        result.difficulty === 'survival' && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">問題正解数</span>
                                                <span className="font-mono text-base md:text-lg font-semibold text-foreground">
                                                    {result.completedQuestionCount}
                                                </span>
                                            </div>
                                        )}
                                    {typeof result.maxCombo === 'number' && result.difficulty === 'survival' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">最大コンボ</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-amber-500">
                                                {result.maxCombo}
                                            </span>
                                        </div>
                                    )}
                                    {typeof result.reachedPhase === 'number' && result.difficulty === 'survival' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">到達フェーズ</span>
                                            <span className="font-mono text-base md:text-lg font-semibold text-sky-500">
                                                Phase {result.reachedPhase}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isLoadingLeaderboard || displayedLeaderboard.length > 0 ? (
                                <div className="space-y-3 border-t border-border/70 pt-4">
                                    <div className="text-sm text-muted-foreground">
                                        難易度別ランキング TOP {displayedLeaderboard.length}
                                    </div>
                                    {isLoadingLeaderboard ? (
                                        <div className="space-y-2 max-h-56">
                                            <div className="rounded border border-border/70 px-3 py-2 flex justify-between items-center">
                                                <div className="text-sm text-foreground animate-pulse">
                                                    ランキングを読み込み中...
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-56 overflow-y-auto">
                                            {displayedLeaderboard.map((entry) => (
                                                <div
                                                    key={`${entry.rank}-${entry.playerName}-${entry.createdAt}`}
                                                    className="rounded border border-border/70 px-3 py-2 flex justify-between items-center"
                                                >
                                                    <div className="text-sm text-foreground">
                                                        {entry.rank}. {entry.playerName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        正解タイプ数 {entry.correctCount} / KPM{' '}
                                                        {formatNumber(entry.kpm, 1)} / 正解率{' '}
                                                        {formatNumber(entry.correctRate, 1)}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}

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
