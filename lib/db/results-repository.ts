import { Difficulty, GameResult } from '@/types/typing';
import { ensureDbSchema, getDbClient } from '@/lib/db/client';

export type ResultMode = 'single' | 'multi';

export interface SaveGameResultInput extends GameResult {
    mode: ResultMode;
    roomCode?: string;
    startedAt?: number;
    endedAt?: number;
}

export interface LeaderboardEntry {
    rank: number;
    playerName: string;
    kpm: number;
    totalInputCount: number;
    correctRate: number;
    correctCount: number;
    totalTime: number;
    mode: ResultMode;
    createdAt: number;
}

const getPositiveInt = (value: number, fallback = 0): number => {
    if (!Number.isFinite(value) || value < 0) return fallback;
    return Math.floor(value);
};

const getFloat = (value: number, fallback = 0): number => {
    if (!Number.isFinite(value) || value < 0) return fallback;
    return value;
};

const sanitizeDifficulty = (value: Difficulty): Difficulty => {
    if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'survival') {
        return value;
    }
    return 'easy';
};

const sanitizeMode = (value: ResultMode): ResultMode => {
    return value === 'multi' ? 'multi' : 'single';
};

export const saveGameResult = async (input: SaveGameResultInput): Promise<{ dbRank: number }> => {
    await ensureDbSchema();
    const db = getDbClient();

    const safeDifficulty = sanitizeDifficulty(input.difficulty);
    const safeMode = sanitizeMode(input.mode);
    const safePlayerId = String(input.playerId || `anon-${Date.now()}`);
    const safePlayerName = String(input.playerName || 'Player').trim().slice(0, 24) || 'Player';

    await db.batch(
        [
            {
                sql: `
                    INSERT INTO players (id, display_name)
                    VALUES (?, ?)
                    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name
                `,
                args: [safePlayerId, safePlayerName],
            },
            {
                sql: `
                    INSERT OR IGNORE INTO game_sessions (
                        id, mode, difficulty, started_at, ended_at, room_code, source
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                    input.sessionId,
                    safeMode,
                    safeDifficulty,
                    input.startedAt ?? null,
                    input.endedAt ?? null,
                    input.roomCode ?? null,
                    'web',
                ],
            },
            {
                sql: `
                    INSERT INTO game_results (
                        session_id,
                        player_id,
                        player_name,
                        mode,
                        difficulty,
                        total_time_ms,
                        correct_count,
                        error_count,
                        total_input_count,
                        correct_rate,
                        error_rate,
                        kpm,
                        max_combo,
                        completed_question_count,
                        survival_duration_seconds,
                        reached_phase,
                        multiplayer_rank
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                args: [
                    input.sessionId,
                    safePlayerId,
                    safePlayerName,
                    safeMode,
                    safeDifficulty,
                    getPositiveInt(input.totalTime),
                    getPositiveInt(input.correctCount),
                    getPositiveInt(input.errorCount),
                    getPositiveInt(input.totalInputCount),
                    getFloat(input.correctRate),
                    getFloat(input.errorRate),
                    getFloat(input.kpm),
                    input.maxCombo ?? null,
                    input.completedQuestionCount ?? null,
                    input.survivalDurationSeconds ?? null,
                    input.reachedPhase ?? null,
                    input.rank ?? null,
                ],
            },
        ],
        'write',
    );

    const insertedRow = await db.execute({ sql: 'SELECT last_insert_rowid() AS id' });
    const insertedId = Number(insertedRow.rows[0]?.id ?? 0);

    const rankRow = await db.execute({
        sql: `
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            correct_count DESC,
                            total_input_count DESC,
                            kpm DESC,
                            correct_rate DESC,
                            total_time_ms ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM game_results
                WHERE difficulty = ?
            )
            SELECT rank
            FROM ranked
            WHERE id = ?
        `,
        args: [safeDifficulty, insertedId],
    });

    return {
        dbRank: Number(rankRow.rows[0]?.rank ?? 0),
    };
};

export const getDifficultyLeaderboard = async (
    difficulty: Difficulty,
    limit = 10,
): Promise<LeaderboardEntry[]> => {
    await ensureDbSchema();
    const db = getDbClient();

    const safeDifficulty = sanitizeDifficulty(difficulty);
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

    const rows = await db.execute({
        sql: `
            WITH ranked AS (
                SELECT
                    player_name,
                    kpm,
                    total_input_count,
                    correct_rate,
                    correct_count,
                    total_time_ms,
                    mode,
                    created_at,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            correct_count DESC,
                            total_input_count DESC,
                            kpm DESC,
                            correct_rate DESC,
                            total_time_ms ASC,
                            created_at ASC,
                            id ASC
                    ) AS rank
                FROM game_results
                WHERE difficulty = ?
            )
            SELECT
                rank,
                player_name,
                kpm,
                total_input_count,
                correct_rate,
                correct_count,
                total_time_ms,
                mode,
                created_at
            FROM ranked
            WHERE rank <= ?
            ORDER BY rank ASC
        `,
        args: [safeDifficulty, safeLimit],
    });

    return rows.rows.map((row) => ({
        rank: Number(row.rank ?? 0),
        playerName: String(row.player_name ?? 'Player'),
        kpm: Number(row.kpm ?? 0),
        totalInputCount: Number(row.total_input_count ?? 0),
        correctRate: Number(row.correct_rate ?? 0),
        correctCount: Number(row.correct_count ?? 0),
        totalTime: Number(row.total_time_ms ?? 0),
        mode: row.mode === 'multi' ? 'multi' : 'single',
        createdAt: Number(row.created_at ?? 0),
    }));
};
