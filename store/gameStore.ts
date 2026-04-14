import { create } from 'zustand';
import { Difficulty, GameResult, SinglePlaySession } from '@/types/typing';

interface Question {
    id: string;
    difficulty: Difficulty;
    japanese: string;
    romaji: string;
    alternatives?: string[];
}

interface GameStore {
    // UI状態
    currentScreen: 'home' | 'single' | 'multi';
    setScreen: (screen: 'home' | 'single' | 'multi') => void;

    // ゲーム状態
    isPlaying: boolean;
    isPaused: boolean;
    difficulty: Difficulty;
    setDifficulty: (difficulty: Difficulty) => void;
    gameDurationMinutes: number;
    setGameDurationMinutes: (minutes: number) => void;
    currentSession: SinglePlaySession | null;

    // アクション
    startGame: (difficulty: Difficulty, question: Question) => void;
    pauseGame: () => void;
    resumeGame: () => void;
    endGame: (result: GameResult) => void;
    resetGame: () => void;

    // ゲーム履歴
    gameHistory: GameResult[];
    addToHistory: (result: GameResult) => void;
}

export const useGameStore = create<GameStore>((set) => ({
    // 初期状態
    currentScreen: 'home',
    isPlaying: false,
    isPaused: false,
    difficulty: 'easy',
    gameDurationMinutes: 1,
    setDifficulty: (difficulty) =>
        set(() => ({
            difficulty,
        })),
    setGameDurationMinutes: (minutes) =>
        set(() => ({
            gameDurationMinutes: Math.min(5, Math.max(1, minutes)),
        })),

    currentSession: null,
    gameHistory: [],

    // スクリーン切り替え
    setScreen: (screen) =>
        set(() => ({
            currentScreen: screen,
        })),

    // ゲーム開始
    startGame: (difficulty, question) =>
        set(() => ({
            isPlaying: true,
            isPaused: false,
            difficulty,
            currentSession: {
                sessionId: `session-${Date.now()}`,
                playerId: `player-${Math.random().toString(36).substr(2, 9)}`,
                difficulty,
                question,
                startedAt: Date.now(),
                playerStatus: {
                    playerId: `player-${Math.random().toString(36).substr(2, 9)}`,
                    name: 'You',
                    currentCharIndex: 0,
                    correctCount: 0,
                    errorCount: 0,
                    totalInputCount: 0,
                    isCompleted: false,
                    elapsedTime: 0,
                },
            },
        })),

    // ゲーム一時停止
    pauseGame: () => set({ isPaused: true }),

    // ゲーム再開
    resumeGame: () => set({ isPaused: false }),

    // ゲーム終了
    endGame: (result) =>
        set((state) => ({
            isPlaying: false,
            currentSession: null,
            gameHistory: [...state.gameHistory, result],
        })),

    // ゲームリセット
    resetGame: () =>
        set({
            isPlaying: false,
            isPaused: false,
            currentSession: null,
        }),

    // 履歴に追加
    addToHistory: (result) =>
        set((state) => ({
            gameHistory: [...state.gameHistory, result],
        })),
}));
