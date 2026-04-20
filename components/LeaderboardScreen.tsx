'use client';

import React from 'react';
import { BarChart3, ChevronLeft } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Difficulty, DifficultyLeaderboardEntry } from '@/types/typing';
import { UserStatsModal } from '@/components/UserStatsModal';

interface LeaderboardScreenProps {
    onBackToHome?: () => void;
}

const difficultyTabs: Array<{ key: Difficulty; label: string }> = [
    { key: 'easy', label: '初級' },
    { key: 'medium', label: '中級' },
    { key: 'hard', label: '上級' },
    { key: 'survival', label: '極限' },
];

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onBackToHome }) => {
    const [activeDifficulty, setActiveDifficulty] = React.useState<Difficulty>('easy');
    const [entries, setEntries] = React.useState<DifficultyLeaderboardEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState('');
    const [modeFilter, setModeFilter] = React.useState<'all' | 'single' | 'multi'>('all');
    const [sortBy, setSortBy] = React.useState<'correctCount' | 'kpm' | 'correctRate' | 'createdAt' | 'rank'>(
        'correctCount',
    );
    const [selectedUserInfo, setSelectedUserInfo] = React.useState<{
        userId: string;
        playerName: string;
        avatar?: string;
        userLevel?: number;
    } | null>(null);
    const sortedEntries = React.useMemo(() => {
        const filtered = entries.filter((entry) => modeFilter === 'all' || entry.mode === modeFilter);
        return [...filtered].sort((a, b) => {
            const compare = (left: number, right: number) => {
                if (left === right) return 0;
                return left > right ? -1 : 1;
            };

            if (sortBy === 'kpm') return compare(a.kpm, b.kpm) || a.rank - b.rank;
            if (sortBy === 'correctRate') return compare(a.correctRate, b.correctRate) || a.rank - b.rank;
            if (sortBy === 'createdAt') return compare(a.createdAt, b.createdAt) || a.rank - b.rank;
            if (sortBy === 'rank') return a.rank - b.rank;
            return compare(a.correctCount, b.correctCount) || a.rank - b.rank;
        });
    }, [entries, modeFilter, sortBy]);

    const modeCounts = React.useMemo(() => {
        const single = entries.filter((entry) => entry.mode === 'single').length;
        const multi = entries.filter((entry) => entry.mode === 'multi').length;
        return {
            all: entries.length,
            single,
            multi,
        };
    }, [entries]);

    const formatCreatedAt = (unixSeconds: number) => {
        if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return '-';
        return new Date(unixSeconds * 1000).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getSelectedMetricLabel = (entry: DifficultyLeaderboardEntry) => {
        if (sortBy === 'rank') return `サーバー順位 ${entry.rank}`;
        if (sortBy === 'correctRate') return `正解率 ${entry.correctRate.toFixed(1)}%`;
        if (sortBy === 'kpm') return `KPM ${entry.kpm.toFixed(1)}`;
        if (sortBy === 'createdAt') return `日時 ${formatCreatedAt(entry.createdAt)}`;
        return `正解タイプ数 ${entry.correctCount}`;
    };

    React.useEffect(() => {
        let cancelled = false;

        const fetchLeaderboard = async () => {
            setIsLoading(true);
            setErrorMessage('');

            try {
                const response = await fetch(`/api/results?difficulty=${activeDifficulty}&limit=30`, {
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error('ランキングの取得に失敗しました。');
                }

                const payload = (await response.json()) as {
                    ok: boolean;
                    leaderboard?: DifficultyLeaderboardEntry[];
                };

                if (!payload.ok) {
                    throw new Error('ランキングの取得に失敗しました。');
                }

                if (!cancelled) {
                    const next = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
                    setEntries(next.sort((a, b) => a.rank - b.rank));
                }
            } catch (error) {
                if (!cancelled) {
                    setEntries([]);
                    setErrorMessage(error instanceof Error ? error.message : '不明なエラーが発生しました。');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void fetchLeaderboard();

        return () => {
            cancelled = true;
        };
    }, [activeDifficulty]);

    return (
        <div className="h-dvh p-3 md:p-4 overflow-hidden animate-fade-up-soft">
            <div className="surface-card max-w-4xl mx-auto h-full p-4 md:p-5 space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="size-6 text-primary" />
                        <h2 className="text-xl md:text-2xl font-light">リーダーボード</h2>
                    </div>
                    <ActionButton
                        onClick={onBackToHome}
                        variant="outline"
                        icon={ChevronLeft}
                        className="w-auto"
                        size="sm"
                    >
                        戻る
                    </ActionButton>
                </div>

                <div className="surface-muted p-1 grid grid-cols-2 md:grid-cols-4 gap-1">
                    {difficultyTabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveDifficulty(tab.key)}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                activeDifficulty === tab.key
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:bg-card/60'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">表示モード</div>
                        <div className="surface-muted p-1 grid grid-cols-3 gap-1">
                            <button
                                type="button"
                                onClick={() => setModeFilter('all')}
                                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                    modeFilter === 'all'
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card/60'
                                }`}
                            >
                                すべて ({modeCounts.all})
                            </button>
                            <button
                                type="button"
                                onClick={() => setModeFilter('single')}
                                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                    modeFilter === 'single'
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card/60'
                                }`}
                            >
                                シングル ({modeCounts.single})
                            </button>
                            <button
                                type="button"
                                onClick={() => setModeFilter('multi')}
                                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                    modeFilter === 'multi'
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-card/60'
                                }`}
                            >
                                マルチ ({modeCounts.multi})
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">並び替え項目</div>
                        <Select
                            value={sortBy}
                            onValueChange={(value) =>
                                setSortBy(value as 'correctCount' | 'kpm' | 'correctRate' | 'createdAt' | 'rank')
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rank">サーバー順位</SelectItem>
                                <SelectItem value="correctCount">正解タイプ数</SelectItem>
                                <SelectItem value="correctRate">正解率</SelectItem>
                                <SelectItem value="kpm">KPM</SelectItem>
                                <SelectItem value="createdAt">日時</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {isLoading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
                {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}

                {!isLoading && !errorMessage && sortedEntries.length === 0 && (
                    <div className="text-sm text-muted-foreground">この難易度の記録はまだありません。</div>
                )}

                {!isLoading && !errorMessage && sortedEntries.length > 0 && (
                    <div className="space-y-2">
                        {sortedEntries.map((entry, index) => {
                            // ログインユーザーの場合はプレイヤー名をクリック可能にする
                            const playerNameElement =
                                entry.userId && !entry.userId.startsWith('anon-') ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedUserInfo({
                                                userId: entry.userId || '',
                                                playerName: entry.playerName,
                                                avatar: entry.avatar,
                                                userLevel: entry.lv,
                                            });
                                        }}
                                        className="font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                                    >
                                        {entry.playerName}
                                    </button>
                                ) : (
                                    <span className="font-medium">{entry.playerName}</span>
                                );

                            return (
                                <div
                                    key={`${entry.rank}-${entry.playerName}-${entry.createdAt}`}
                                    className="w-full rounded border border-border px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`w-8 text-center font-semibold ${
                                                    index + 1 === 1
                                                        ? 'text-yellow-600'
                                                        : index + 1 === 2
                                                          ? 'text-gray-400'
                                                          : index + 1 === 3
                                                            ? 'text-amber-600'
                                                            : 'text-muted-foreground'
                                                }`}
                                            >
                                                {index + 1}
                                            </span>
                                            <span className="text-2xl">{entry.avatar || '😊'}</span>
                                            {playerNameElement}
                                            {entry.lv && (
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300">
                                                    Lv {entry.lv}
                                                </span>
                                            )}
                                            <span
                                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                                    entry.mode === 'multi'
                                                        ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                }`}
                                            >
                                                {entry.mode === 'multi' ? 'マルチ' : 'シングル'}
                                            </span>
                                        </div>
                                        <div className="text-xs md:text-sm text-muted-foreground text-right">
                                            {getSelectedMetricLabel(entry)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ユーザー統計モーダル */}
                {selectedUserInfo && (
                    <UserStatsModal
                        isOpen={!!selectedUserInfo}
                        onClose={() => setSelectedUserInfo(null)}
                        playerName={selectedUserInfo.playerName}
                        avatar={selectedUserInfo.avatar}
                        userLevel={selectedUserInfo.userLevel}
                        userId={selectedUserInfo.userId}
                    />
                )}
            </div>
        </div>
    );
};
