'use client';

import React from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { SinglePlayScreen } from '@/components/SinglePlayScreen';
import { MultiPlayScreen } from '@/components/MultiPlayScreen';
import { useGameStore } from '@/store/gameStore';
import { Difficulty } from '@/types/typing';

/**
 * ページルーティング管理（クライアント側）
 */
export const ClientPage: React.FC = () => {
    const { currentScreen, setScreen, setDifficulty, setGameDurationMinutes } = useGameStore();
    const [multiplayerOnline, setMultiplayerOnline] = React.useState(false);
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
    const multiplayerUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';

    const handleSelectSinglePlay = (difficulty: Difficulty, minutes: number) => {
        setDifficulty(difficulty);
        setGameDurationMinutes(minutes);
        setScreen('single');
    };

    const handleSelectMultiPlay = () => {
        setScreen('multi');
    };

    const handleBackToHome = () => {
        setScreen('home');
    };

    React.useEffect(() => {
        let cancelled = false;

        const checkStatus = async () => {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                const response = await fetch(`${multiplayerUrl}/health`, {
                    method: 'GET',
                    signal: controller.signal,
                    cache: 'no-store',
                });
                clearTimeout(timeout);
                if (!cancelled) {
                    setMultiplayerOnline(response.ok);
                }
            } catch {
                if (!cancelled) {
                    setMultiplayerOnline(false);
                }
            }
        };

        checkStatus();
        const timer = setInterval(checkStatus, 10000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [multiplayerUrl]);

    return (
        <main className="min-h-screen bg-white">
            {currentScreen === 'home' && (
                <HomeScreen
                    onSelectSinglePlay={handleSelectSinglePlay}
                    onSelectMultiPlay={handleSelectMultiPlay}
                    multiplayerOnline={multiplayerOnline}
                    appVersion={appVersion}
                />
            )}

            {currentScreen === 'single' && <SinglePlayScreen onBackToHome={handleBackToHome} />}

            {currentScreen === 'multi' && <MultiPlayScreen onBackToHome={handleBackToHome} />}
        </main>
    );
};
