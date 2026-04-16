'use client';

import React from 'react';
import { HomeScreen } from '@/components/HomeScreen';
import { LeaderboardScreen } from '@/components/LeaderboardScreen';
import { SinglePlayScreen } from '@/components/SinglePlayScreen';
import { MultiPlayScreen } from '@/components/MultiPlayScreen';
import { useGameStore } from '@/store/gameStore';
import { Difficulty } from '@/types/typing';

/**
 * ページルーティング管理（クライアント側）
 */
interface ClientPageProps {
    appVersion: string;
}

export const ClientPage: React.FC<ClientPageProps> = ({ appVersion }) => {
    const { currentScreen, setScreen, setDifficulty, setGameDurationMinutes } = useGameStore();

    const handleSelectSinglePlay = (difficulty: Difficulty, minutes: number) => {
        setDifficulty(difficulty);
        setGameDurationMinutes(minutes);
        setScreen('single');
    };

    const handleSelectMultiPlay = () => {
        setScreen('multi');
    };

    const handleSelectLeaderboard = () => {
        setScreen('leaderboard');
    };

    const handleBackToHome = () => {
        setScreen('home');
    };

    return (
        <main className="h-dvh overflow-hidden">
            {currentScreen === 'home' && (
                <HomeScreen
                    onSelectSinglePlay={handleSelectSinglePlay}
                    onSelectMultiPlay={handleSelectMultiPlay}
                    onSelectLeaderboard={handleSelectLeaderboard}
                    appVersion={appVersion}
                />
            )}

            {currentScreen === 'single' && <SinglePlayScreen onBackToHome={handleBackToHome} />}

            {currentScreen === 'multi' && <MultiPlayScreen onBackToHome={handleBackToHome} />}

            {currentScreen === 'leaderboard' && <LeaderboardScreen onBackToHome={handleBackToHome} />}
        </main>
    );
};
