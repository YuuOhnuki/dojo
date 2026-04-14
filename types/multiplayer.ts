import { Difficulty, Question } from '@/types/typing';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface MultiplayerPlayer {
    playerId: string;
    name: string;
    currentCharIndex: number;
    correctCount: number;
    errorCount: number;
    totalInputCount: number;
    correctRate: number;
    isCompleted: boolean;
    elapsedTime: number;
    finishedAt: number | null;
}

export interface MultiplayerRoomState {
    roomCode: string;
    hostPlayerId: string;
    difficulty: Difficulty;
    minutes: number;
    status: RoomStatus;
    questionLength: number;
    startedAt: number | null;
    players: MultiplayerPlayer[];
}

export interface GameStartedPayload {
    question: Question;
    timeLimitSeconds: number;
    startedAt: number;
}
