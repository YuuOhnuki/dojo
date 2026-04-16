import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { createClient } from '@libsql/client';

const PORT = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 4001);
const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000';
const MAX_PLAYERS_PER_ROOM = 12;
const MINUTES_MIN = 1;
const MINUTES_MAX = 5;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function loadLocalEnv() {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex <= 0) continue;
        const key = trimmed.slice(0, separatorIndex).trim();
        if (!key || process.env[key] !== undefined) continue;
        const value = trimmed.slice(separatorIndex + 1).trim();
        process.env[key] = value;
    }
}

loadLocalEnv();

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const TURSO_ENABLED = Boolean(
    TURSO_DATABASE_URL && (!TURSO_DATABASE_URL.startsWith('libsql://') || TURSO_AUTH_TOKEN),
);

const tursoClient = TURSO_ENABLED
    ? createClient({
          url: TURSO_DATABASE_URL,
          authToken: TURSO_AUTH_TOKEN,
      })
    : null;

let schemaEnsured = false;

const CREATE_DB_SCHEMA_SQL = [
    `
    CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('single', 'multi')),
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'survival')),
        started_at INTEGER,
        ended_at INTEGER,
        room_code TEXT,
        source TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('single', 'multi')),
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'survival')),
        total_time_ms INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        total_input_count INTEGER NOT NULL,
        correct_rate REAL NOT NULL,
        error_rate REAL NOT NULL,
        kpm REAL NOT NULL,
        max_combo INTEGER,
        completed_question_count INTEGER,
        survival_duration_seconds INTEGER,
        reached_phase INTEGER,
        multiplayer_rank INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (session_id) REFERENCES game_sessions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_results_difficulty_score
    ON game_results (difficulty, correct_count DESC, total_input_count DESC, kpm DESC, total_time_ms ASC)
    `,
];

const dataPath = path.join(process.cwd(), 'data', 'questions.json');
const questionsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

/**
 * @typedef {{
 *   playerId: string;
 *   socketId: string;
 *   name: string;
 *   currentCharIndex: number;
 *   correctCount: number;
 *   errorCount: number;
 *   totalInputCount: number;
 *   isCompleted: boolean;
 *   elapsedTime: number;
 *   finishedAt: number | null;
 *   dbRank: number | null;
 *   persistedToDb: boolean;
 * }} Player
 */

/**
 * @typedef {{
 *   code: string;
 *   hostPlayerId: string;
 *   difficulty: 'easy' | 'medium' | 'hard';
 *   minutes: number;
 *   status: 'waiting' | 'playing' | 'finished';
 *   question: { id: string; difficulty: string; japanese: string; romaji: string; alternatives?: string[] };
 *   startedAt: number | null;
 *   players: Map<string, Player>;
 * }} Room
 */

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * health など HTTP エンドポイント用の CORS ヘッダーを付与する。
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function applyHttpCorsHeaders(req, res) {
    const requestOrigin = req.headers.origin;
    const allowOrigin = requestOrigin === CLIENT_ORIGIN ? requestOrigin : CLIENT_ORIGIN;
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Vary', 'Origin');
}

const server = http.createServer((req, res) => {
    applyHttpCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'e-typic-multiplayer-socket' }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
});
const io = new Server(server, {
    cors: {
        origin: ['https://localhost:3000', CLIENT_ORIGIN],
        credentials: true,
    },
});

function makeRoomCode() {
    return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

/**
 * プレイヤー名をサニタイズして、UI崩れや制御文字混入を防ぐ。
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function sanitizePlayerName(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const normalized = value
        .trim()
        .replace(/[\x00-\x1F\x7F]/g, '')
        .slice(0, 16);
    return normalized || fallback;
}

/**
 * ルームコードを 3 桁数字に正規化する。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRoomCode(value) {
    return String(value ?? '')
        .replace(/\D/g, '')
        .slice(0, 3);
}

/**
 * 難易度をホワイトリストで検証する。
 * @param {unknown} value
 * @returns {'easy' | 'medium' | 'hard'}
 */
function normalizeDifficulty(value) {
    if (typeof value === 'string' && ALLOWED_DIFFICULTIES.has(value)) {
        return /** @type {'easy' | 'medium' | 'hard'} */ (value);
    }
    return 'easy';
}

/**
 * 時間(分)を許可範囲へ丸める。
 * @param {unknown} value
 * @returns {number}
 */
function normalizeMinutes(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return MINUTES_MIN;
    const rounded = Math.round(numeric);
    return Math.min(Math.max(rounded, MINUTES_MIN), MINUTES_MAX);
}

/**
 * 進捗カウンタを 0 以上の整数へ丸める。
 * @param {unknown} value
 * @returns {number}
 */
function toNonNegativeInt(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
}

async function ensureDbSchema() {
    if (!tursoClient || schemaEnsured) return;
    for (const statement of CREATE_DB_SCHEMA_SQL) {
        await tursoClient.execute(statement);
    }
    schemaEnsured = true;
}

function generateUniqueRoomCode() {
    let code = makeRoomCode();
    while (rooms.has(code)) {
        code = makeRoomCode();
    }
    return code;
}

function pickQuestion(difficulty) {
    const list = questionsData?.questions?.[difficulty] ?? [];
    if (list.length === 0) {
        return {
            id: 'default',
            difficulty: 'easy',
            japanese: 'てすと',
            romaji: 'tesuto',
        };
    }
    return list[Math.floor(Math.random() * list.length)];
}

function resetPlayerStatus(player) {
    player.currentCharIndex = 0;
    player.correctCount = 0;
    player.errorCount = 0;
    player.totalInputCount = 0;
    player.isCompleted = false;
    player.elapsedTime = 0;
    player.finishedAt = null;
    player.dbRank = null;
    player.persistedToDb = false;
}

function toPublicPlayer(player) {
    const totalAttemptCount = player.totalInputCount + player.errorCount;
    const correctRate = totalAttemptCount > 0 ? (player.correctCount / totalAttemptCount) * 100 : 0;
    return {
        playerId: player.playerId,
        name: player.name,
        currentCharIndex: player.currentCharIndex,
        correctCount: player.correctCount,
        errorCount: player.errorCount,
        totalInputCount: player.totalInputCount,
        correctRate,
        isCompleted: player.isCompleted,
        elapsedTime: player.elapsedTime,
        finishedAt: player.finishedAt ?? null,
        dbRank: player.dbRank ?? null,
    };
}

function sortPlayersByRace(players) {
    return [...players].sort((a, b) => {
        if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
        if (a.totalInputCount !== b.totalInputCount) return b.totalInputCount - a.totalInputCount;
        if (a.errorCount !== b.errorCount) return a.errorCount - b.errorCount;
        return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
    });
}

function getPlayerRaceRank(room, playerId) {
    const sorted = sortPlayersByRace(Array.from(room.players.values()));
    const index = sorted.findIndex((player) => player.playerId === playerId);
    return index >= 0 ? index + 1 : null;
}

async function persistMultiplayerResult(room, player, multiplayerRank) {
    if (!tursoClient || player.persistedToDb) return;

    try {
        await ensureDbSchema();

        const totalAttempts = player.totalInputCount + player.errorCount;
        const correctRate = totalAttempts > 0 ? (player.correctCount / totalAttempts) * 100 : 0;
        const errorRate = totalAttempts > 0 ? (player.errorCount / totalAttempts) * 100 : 0;
        const kpm = player.elapsedTime > 0 ? player.totalInputCount / (player.elapsedTime / 60000) : 0;
        const sessionId = `multi-${room.code}-${room.startedAt ?? Date.now()}`;

        await tursoClient.batch(
            [
                {
                    sql: `
                        INSERT INTO players (id, display_name)
                        VALUES (?, ?)
                        ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name
                    `,
                    args: [player.playerId, player.name],
                },
                {
                    sql: `
                        INSERT OR IGNORE INTO game_sessions (
                            id, mode, difficulty, started_at, ended_at, room_code, source
                        )
                        VALUES (?, 'multi', ?, ?, ?, ?, ?)
                    `,
                    args: [sessionId, room.difficulty, room.startedAt ?? null, Date.now(), room.code, 'socket-server'],
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
                            multiplayer_rank
                        )
                        VALUES (?, ?, ?, 'multi', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    args: [
                        sessionId,
                        player.playerId,
                        player.name,
                        room.difficulty,
                        toNonNegativeInt(player.elapsedTime),
                        toNonNegativeInt(player.correctCount),
                        toNonNegativeInt(player.errorCount),
                        toNonNegativeInt(player.totalInputCount),
                        Math.max(correctRate, 0),
                        Math.max(errorRate, 0),
                        Math.max(kpm, 0),
                        multiplayerRank,
                    ],
                },
            ],
            'write',
        );

        const insertedRow = await tursoClient.execute({ sql: 'SELECT last_insert_rowid() AS id' });
        const insertedId = Number(insertedRow.rows[0]?.id ?? 0);
        const rankRow = await tursoClient.execute({
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
            args: [room.difficulty, insertedId],
        });

        player.dbRank = Number(rankRow.rows[0]?.rank ?? 0);
        player.persistedToDb = true;
    } catch (error) {
        console.error('[multiplayer][db] failed to persist result', error);
    }
}

function emitRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const players = sortPlayersByRace(Array.from(room.players.values())).map(toPublicPlayer);

    io.to(roomCode).emit('room:state', {
        roomCode: room.code,
        hostPlayerId: room.hostPlayerId,
        difficulty: room.difficulty,
        minutes: room.minutes,
        status: room.status,
        questionLength: room.question.romaji.length,
        startedAt: room.startedAt ?? null,
        players,
    });
}

function handleCompletionIfFinished(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;
    const allCompleted = Array.from(room.players.values()).every((player) => player.isCompleted);
    if (!allCompleted) return;

    room.status = 'finished';
    emitRoomState(roomCode);
    io.to(roomCode).emit('game:finished');
}

io.on('connection', (socket) => {
    socket.on('room:create', ({ playerName, difficulty, minutes }, ack) => {
        const roomCode = generateUniqueRoomCode();
        const safeDifficulty = normalizeDifficulty(difficulty);
        const safeMinutes = normalizeMinutes(minutes);
        const question = pickQuestion(safeDifficulty);
        const playerId = socket.id;

        const room = {
            code: roomCode,
            hostPlayerId: playerId,
            difficulty: safeDifficulty,
            minutes: safeMinutes,
            status: 'waiting',
            question,
            startedAt: null,
            players: new Map(),
        };

        room.players.set(playerId, {
            playerId,
            socketId: socket.id,
            name: sanitizePlayerName(playerName, 'Host'),
            currentCharIndex: 0,
            correctCount: 0,
            errorCount: 0,
            totalInputCount: 0,
            isCompleted: false,
            elapsedTime: 0,
            finishedAt: null,
            dbRank: null,
            persistedToDb: false,
        });

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.data.roomCode = roomCode;
        socket.data.playerId = playerId;

        ack?.({ ok: true, roomCode, playerId, question });
        emitRoomState(roomCode);
    });

    socket.on('room:join', ({ roomCode, playerName }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '既に開始済みのルームです。' });
            return;
        }
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            ack?.({ ok: false, message: 'ルームが満員です。' });
            return;
        }

        const playerId = socket.id;
        room.players.set(playerId, {
            playerId,
            socketId: socket.id,
            name: sanitizePlayerName(playerName, 'Player'),
            currentCharIndex: 0,
            correctCount: 0,
            errorCount: 0,
            totalInputCount: 0,
            isCompleted: false,
            elapsedTime: 0,
            finishedAt: null,
            dbRank: null,
            persistedToDb: false,
        });

        socket.join(normalizedCode);
        socket.data.roomCode = normalizedCode;
        socket.data.playerId = playerId;

        ack?.({ ok: true, roomCode: normalizedCode, playerId, question: room.question });
        emitRoomState(normalizedCode);
    });

    socket.on('room:start', ({ roomCode }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.hostPlayerId !== socket.id) {
            ack?.({ ok: false, message: 'ホストのみ開始できます。' });
            return;
        }
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '開始できる状態ではありません。' });
            return;
        }

        room.status = 'playing';
        room.startedAt = Date.now();
        emitRoomState(normalizedCode);
        io.to(normalizedCode).emit('game:started', {
            question: room.question,
            timeLimitSeconds: room.minutes * 60,
            startedAt: room.startedAt,
        });
        ack?.({ ok: true });
    });

    socket.on('room:update-settings', ({ roomCode, difficulty, minutes }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.hostPlayerId !== socket.id) {
            ack?.({ ok: false, message: 'ホストのみ変更できます。' });
            return;
        }
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '待機中のみ設定変更できます。' });
            return;
        }

        room.difficulty = normalizeDifficulty(difficulty ?? room.difficulty);
        room.minutes = normalizeMinutes(minutes ?? room.minutes);
        room.question = pickQuestion(room.difficulty);
        emitRoomState(normalizedCode);
        ack?.({ ok: true, question: room.question });
    });

    socket.on('room:reopen', ({ roomCode }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.hostPlayerId !== socket.id) {
            ack?.({ ok: false, message: 'ホストのみ操作できます。' });
            return;
        }

        room.status = 'waiting';
        room.startedAt = null;
        room.question = pickQuestion(room.difficulty);
        room.players.forEach((player) => resetPlayerStatus(player));
        emitRoomState(normalizedCode);
        ack?.({ ok: true, question: room.question });
    });

    socket.on('game:progress', ({ roomCode, progress }) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        if (normalizedCode !== socket.data.roomCode) return;
        const room = rooms.get(normalizedCode);
        if (!room || room.status !== 'playing') return;
        const player = room.players.get(socket.id);
        if (!player || player.isCompleted) return;

        const nextCurrent = toNonNegativeInt(progress?.currentCharIndex);
        const nextCorrect = toNonNegativeInt(progress?.correctCount);
        const nextTotal = toNonNegativeInt(progress?.totalInputCount);
        const nextError = toNonNegativeInt(progress?.errorCount);
        player.currentCharIndex = Math.max(player.currentCharIndex, nextCurrent);
        player.correctCount = Math.max(player.correctCount, nextCorrect);
        player.totalInputCount = Math.max(player.totalInputCount, nextTotal);
        player.errorCount = Math.max(player.errorCount, nextError);
        player.elapsedTime = room.startedAt ? Date.now() - room.startedAt : 0;

        emitRoomState(normalizedCode);
    });

    socket.on('game:complete', async ({ roomCode, stats }) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        if (normalizedCode !== socket.data.roomCode) return;
        const room = rooms.get(normalizedCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        player.currentCharIndex = Math.max(player.currentCharIndex, toNonNegativeInt(stats?.currentCharIndex));
        player.correctCount = Math.max(player.correctCount, toNonNegativeInt(stats?.correctCount));
        player.totalInputCount = Math.max(player.totalInputCount, toNonNegativeInt(stats?.totalInputCount));
        player.errorCount = Math.max(player.errorCount, toNonNegativeInt(stats?.errorCount));
        player.elapsedTime = Math.max(player.elapsedTime, toNonNegativeInt(stats?.elapsedTime));
        player.isCompleted = true;
        player.finishedAt = Date.now();

        const multiplayerRank = getPlayerRaceRank(room, player.playerId);
        await persistMultiplayerResult(room, player, multiplayerRank);
        emitRoomState(normalizedCode);
        handleCompletionIfFinished(normalizedCode);
    });

    socket.on('disconnect', () => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        room.players.delete(socket.id);

        if (room.players.size === 0) {
            rooms.delete(roomCode);
            return;
        }

        if (room.hostPlayerId === socket.id) {
            const nextHost = room.players.values().next().value;
            room.hostPlayerId = nextHost.playerId;
        }

        emitRoomState(roomCode);
    });
});

server.listen(PORT, () => {
    console.log(`[multiplayer] socket server listening on :${PORT}`);
});
