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

    const handleBackToHome = () => {
        setScreen('home');
    };

    return (
        <main className="min-h-screen bg-white">
            {currentScreen === 'home' && (
                <HomeScreen
                    onSelectSinglePlay={handleSelectSinglePlay}
                    onSelectMultiPlay={handleSelectMultiPlay}
                    appVersion={appVersion}
                />
            )}

            {currentScreen === 'single' && <SinglePlayScreen onBackToHome={handleBackToHome} />}

            {currentScreen === 'multi' && <MultiPlayScreen onBackToHome={handleBackToHome} />}
        </main>
    );
};
