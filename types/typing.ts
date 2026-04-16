/**
 * Typing Application - Type Definitions
 */

/**
 * 難易度レベル
 */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'survival';

/**
 * 難易度の詳細設定
 */
export interface DifficultyConfig {
    difficulty: Difficulty;
    timeLimit: number; // 秒単位
    description: string;
}

/**
 * 問題データ
 */
export interface Question {
    id: string;
    difficulty: Difficulty;
    japanese: string; // 日本語テキスト（例：「こんにちは」）
    romaji: string; // ローマ字入力（例：「konnichiha」）
    alternatives?: string[]; // 代替入力パターン（例：「こんにちは」→ ["konnichiha", "komnnichiha"]）
}

/**
 * プレイヤーの状態
 */
export interface PlayerStatus {
    playerId: string;
    name: string;
    currentCharIndex: number; // 現在の入力位置
    correctCount: number; // 正解した文字数
    errorCount: number; // 誤字数
    totalInputCount: number; // 入力した文字総数
    isCompleted: boolean;
    elapsedTime: number; // 経過時間（ミリ秒）
}

/**
 * シングルプレイセッション
 */
export interface SinglePlaySession {
    sessionId: string;
    playerId: string;
    difficulty: Difficulty;
    question: Question;
    startedAt: number; // タイムスタンプ
    endedAt?: number;
    playerStatus: PlayerStatus;
}

/**
 * マルチプレイルーム
 */
export interface Room {
    roomId: string;
    code: string; // ルームコード（6文字）
    createdBy: string; // ルーム作成者のID
    difficulty: Difficulty;
    question: Question;
    players: PlayerStatus[];
    startedAt?: number;
    endedAt?: number;
    maxPlayers: number;
    status: 'waiting' | 'playing' | 'finished';
}

/**
 * ゲーム結果
 */
export interface GameResult {
    sessionId: string;
    playerId: string;
    playerName: string;
    difficulty: Difficulty;
    totalTime: number; // ミリ秒
    correctCount: number;
    errorCount: number;
    totalInputCount: number;
    correctRate: number; // パーセンテージ
    errorRate: number;
    kpm: number; // キーストロークパーミニット
    rank?: number; // マルチプレイの場合のランク
    dbRank?: number; // 難易度別DBランキング順位
    maxCombo?: number;
    completedQuestionCount?: number;
    survivalDurationSeconds?: number;
    reachedPhase?: number;
}

export interface DifficultyLeaderboardEntry {
    rank: number;
    playerName: string;
    kpm: number;
    totalInputCount: number;
    correctRate: number;
    correctCount: number;
    totalTime: number;
    mode: 'single' | 'multi';
    createdAt: number;
}

/**
 * WebSocketイベント型
 */
export type WebSocketEventType =
    | 'connect'
    | 'disconnect'
    | 'room:create'
    | 'room:join'
    | 'room:leave'
    | 'game:start'
    | 'game:progress'
    | 'game:complete'
    | 'game:finish'
    | 'error';

/**
 * WebSocketペイロード
 */
export interface WebSocketPayload {
    type: WebSocketEventType;
    data: Record<string, unknown>;
    timestamp: number;
}

/**
 * 入力状態の詳細（リアルタイムUI更新用）
 */
export interface InputState {
    currentIndex: number; // 現在選択中の文字インデックス
    correctIndices: number[]; // 正解済みの文字インデックス
    displayText: string; // 表示用のローマ字テキスト
    nextCharToType?: string; // 次に入力すべき文字
    lastError?: boolean; // 最後の入力がエラーだったか
}
