'use client';

import React from 'react';
import Image from 'next/image';
import {
    BarChart3,
    ChevronLeft,
    Clock3,
    Crown,
    Flame,
    Keyboard,
    Users,
    LogIn,
    UserPlus,
    Settings,
    TrendingUp,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';

import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { Difficulty } from '@/types/typing';

interface HomeScreenProps {
    onSelectSinglePlay: (difficulty: Difficulty, minutes: number) => void;
    onSelectMultiPlay: () => void;
    onSelectLeaderboard: () => void;
    onSelectSignIn?: () => void;
    onSelectSignUp?: () => void;
    onSelectSettings?: () => void;
    onSelectStats?: () => void;
    appVersion: string;
    initialShowDifficultySelect?: boolean;
    onExitDifficultySelect?: () => void;
}

/**
 * ホーム画面 / メニュー
 */
const MULTIPLAYER_SERVER_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';

export const HomeScreen: React.FC<HomeScreenProps> = ({
    onSelectSinglePlay,
    onSelectMultiPlay,
    onSelectLeaderboard,
    onSelectSignIn,
    onSelectSignUp,
    onSelectSettings,
    onSelectStats,
    appVersion,
    initialShowDifficultySelect = false,
    onExitDifficultySelect,
}) => {
    const { data: session } = useSession();
    const [showDifficultySelect, setShowDifficultySelect] = React.useState(initialShowDifficultySelect);
    const [selectedMinutes, setSelectedMinutes] = React.useState<number>(1);
    const [isServerOnline, setIsServerOnline] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        setShowDifficultySelect(initialShowDifficultySelect);
    }, [initialShowDifficultySelect]);

    const difficultyOptions: { key: Difficulty; label: string; description: string; icon: LucideIcon }[] = [
        { key: 'easy', label: '初級', description: '単語中心', icon: Keyboard },
        { key: 'medium', label: '中級', description: '文をテンポ良く', icon: Users },
        { key: 'hard', label: '上級', description: '長文チャレンジ', icon: Crown },
        { key: 'survival', label: '極限', description: 'HP制サバイバル', icon: Flame },
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

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTypingTarget =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable;

            if (event.key === 'Escape') {
                if (!showDifficultySelect) return;
                event.preventDefault();
                setShowDifficultySelect(false);
                onExitDifficultySelect?.();
                return;
            }

            if (event.key !== 'Enter' || isTypingTarget) return;
            event.preventDefault();

            if (showDifficultySelect) {
                onSelectSinglePlay('easy', selectedMinutes);
                return;
            }

            if (isServerOnline) {
                onSelectMultiPlay();
                return;
            }

            setShowDifficultySelect(true);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isServerOnline,
        onExitDifficultySelect,
        onSelectMultiPlay,
        onSelectSinglePlay,
        selectedMinutes,
        showDifficultySelect,
    ]);

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4 pb-24 overflow-hidden animate-fade-up-soft">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-12 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl animate-float-soft" />
                <div
                    className="absolute bottom-8 right-[12%] h-56 w-56 rounded-full bg-sky-400/10 blur-3xl animate-float-soft"
                    style={{ animationDelay: '1.4s' }}
                />
            </div>

            {/* ロゴ/タイトル */}
            <div className="relative text-center mb-4 space-y-4">
                <div className="flex justify-center">
                    <Image
                        src="/logo.svg"
                        alt="e-typic"
                        width={420}
                        height={132}
                        priority
                        className="brand-logo h-auto w-[260px] md:w-[340px]"
                    />
                </div>
            </div>

            {/* ボタングループ */}
            <div className="relative space-y-4 w-full max-w-sm">
                {!showDifficultySelect ? (
                    <div className="space-y-4">
                        <ActionButtonRow>
                            <ActionButton
                                onClick={() => setShowDifficultySelect(true)}
                                variant="default"
                                icon={Keyboard}
                                size="lg"
                            >
                                シングルプレイ
                            </ActionButton>
                            <ActionButton onClick={onSelectMultiPlay} variant="default" icon={Users} size="lg">
                                マルチプレイ
                            </ActionButton>
                            <ActionButton onClick={onSelectLeaderboard} variant="secondary" icon={BarChart3} size="lg">
                                リーダーボード
                            </ActionButton>
                        </ActionButtonRow>

                        {/* 認証関連ボタン */}
                        <ActionButtonRow>
                            {session?.user ? (
                                <>
                                    <ActionButton onClick={onSelectStats} variant="ghost" icon={TrendingUp} size="lg">
                                        マイスタッツ
                                    </ActionButton>
                                    <ActionButton onClick={onSelectSettings} variant="ghost" icon={Settings} size="lg">
                                        設定
                                    </ActionButton>
                                </>
                            ) : (
                                <>
                                    <ActionButton onClick={onSelectSignIn} variant="ghost" icon={LogIn} size="lg">
                                        ログイン
                                    </ActionButton>
                                </>
                            )}
                        </ActionButtonRow>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="text-center text-sm tracking-wide text-muted-foreground">難易度を選択</div>
                        <div className="space-y-2">
                            <div className="surface-muted px-4 py-3">
                                <input
                                    type="range"
                                    min={1}
                                    max={5}
                                    step={1}
                                    value={selectedMinutes}
                                    onChange={(e) => setSelectedMinutes(Number(e.target.value))}
                                    className="w-full accent-primary"
                                    aria-label="プレイ時間"
                                />
                                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>1分</span>
                                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                                        <Clock3 className="size-3.5" />
                                        {selectedMinutes}分
                                    </span>
                                    <span>5分</span>
                                </div>
                            </div>
                        </div>
                        {difficultyOptions.map((option) => (
                            <ActionButton
                                key={option.key}
                                onClick={() => onSelectSinglePlay(option.key, selectedMinutes)}
                                variant="outline"
                                icon={option.icon}
                                size="lg"
                            >
                                <span className="font-semibold text-xl">{option.label}</span>
                            </ActionButton>
                        ))}
                        <ActionButton
                            onClick={() => {
                                setShowDifficultySelect(false);
                                onExitDifficultySelect?.();
                            }}
                            variant="ghost"
                            icon={ChevronLeft}
                            size="lg"
                        >
                            戻る
                        </ActionButton>
                    </div>
                )}
            </div>

            {/* フッター */}
            <div className="absolute bottom-6 text-center text-muted-foreground/80 text-lg animate-soft-pulse">
                <p>&copy; Yuu</p>
            </div>

            <div className="absolute bottom-6 right-6 text-right text-lg text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span className="font-medium">マルチサーバー</span>
                    <span
                        className={`inline-block w-3 h-3 rounded-full ${
                            isServerOnline === null
                                ? 'bg-gray-400 animate-pulse'
                                : isServerOnline
                                  ? 'bg-emerald-500'
                                  : 'bg-red-500'
                        }`}
                    ></span>
                </div>
                <div className="mt-1">v{appVersion}</div>
            </div>
        </div>
    );
};
