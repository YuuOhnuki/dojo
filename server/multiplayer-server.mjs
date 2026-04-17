import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { createClient } from '@libsql/client';

const PORT = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 4001);
const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000';
const MAX_PLAYERS_PER_ROOM = 20;
const MIN_PLAYERS_PER_ROOM = 2;
const MINUTES_MIN = 1;
const MINUTES_MAX = 5;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ALLOWED_TEAM_MODES = new Set(['free', 'two-teams']);
const ALLOWED_SCORE_MODES = new Set(['correct-count', 'correct-rate', 'completed-questions', 'kpm']);
const MAX_CHAT_MESSAGES = 30;
const GAME_START_COUNTDOWN_SECONDS = 3;
const GAME_START_COUNTDOWN_MS = GAME_START_COUNTDOWN_SECONDS * 1000;

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
 *   isReady: boolean;
 *   teamId: 'A' | 'B' | null;
 *   currentCharIndex: number;
 *   correctCount: number;
 *   errorCount: number;
 *   totalInputCount: number;
 *   completedQuestionCount: number;
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
 *   roomName: string;
 *   hostPlayerId: string;
 *   difficulty: 'easy' | 'medium' | 'hard';
 *   minutes: number;
 *   maxPlayers: number;
 *   isPublic: boolean;
 *   autoStart: boolean;
 *   teamMode: 'free' | 'two-teams';
 *   scoreMode: 'correct-count' | 'correct-rate' | 'completed-questions' | 'kpm';
 *   status: 'waiting' | 'playing' | 'finished';
 *   question: { id: string; difficulty: string; japanese: string; romaji: string; alternatives?: string[] };
 *   startedAt: number | null;
 *   countdownTimer: NodeJS.Timeout | null;
 *   finishTimer: NodeJS.Timeout | null;
 *   chatMessages: Array<{ id: string; playerId: string; playerName: string; content: string; sentAt: number }>;
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

const ROOM_NAME_ADJECTIVES = [
    'Swift',
    'Bold',
    'Rapid',
    'Neon',
    'Sunny',
    'Sharp',
    'Brisk',
    'Glide',
    'Flash',
    'Vivid',
];
const ROOM_NAME_NOUNS = ['Falcons', 'Racers', 'Typers', 'Comets', 'Ninjas', 'Rockets', 'Wolves', 'Waves'];

function makeRoomName() {
    const adjective = ROOM_NAME_ADJECTIVES[Math.floor(Math.random() * ROOM_NAME_ADJECTIVES.length)];
    const noun = ROOM_NAME_NOUNS[Math.floor(Math.random() * ROOM_NAME_NOUNS.length)];
    const suffix = Math.floor(Math.random() * 900 + 100);
    return `${adjective} ${noun} ${suffix}`;
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
 * 最大人数を許可範囲へ丸める。
 * @param {unknown} value
 * @returns {number}
 */
function normalizeMaxPlayers(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 6;
    const rounded = Math.round(numeric);
    return Math.min(Math.max(rounded, MIN_PLAYERS_PER_ROOM), MAX_PLAYERS_PER_ROOM);
}

/**
 * 公開設定を boolean に正規化する。
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    return fallback;
}

/**
 * チームモードをホワイトリスト検証する。
 * @param {unknown} value
 * @returns {'free' | 'two-teams'}
 */
function normalizeTeamMode(value) {
    if (typeof value === 'string' && ALLOWED_TEAM_MODES.has(value)) {
        return /** @type {'free' | 'two-teams'} */ (value);
    }
    return 'free';
}

/**
 * 対戦方式をホワイトリスト検証する。
 * @param {unknown} value
 * @returns {'correct-count' | 'correct-rate' | 'completed-questions' | 'kpm'}
 */
function normalizeScoreMode(value) {
    if (typeof value === 'string' && ALLOWED_SCORE_MODES.has(value)) {
        return /** @type {'correct-count' | 'correct-rate' | 'completed-questions' | 'kpm'} */ (value);
    }
    return 'correct-count';
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

/**
 * チャット本文を1行テキストへ正規化し、UI崩れや制御文字混入を防ぐ。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeChatContent(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 120);
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
    player.isReady = false;
    player.currentCharIndex = 0;
    player.correctCount = 0;
    player.errorCount = 0;
    player.totalInputCount = 0;
    player.completedQuestionCount = 0;
    player.isCompleted = false;
    player.elapsedTime = 0;
    player.finishedAt = null;
    player.dbRank = null;
    player.persistedToDb = false;
}

function assignTeamsForRoom(room) {
    const players = Array.from(room.players.values());
    if (room.teamMode === 'free') {
        players.forEach((player) => {
            player.teamId = null;
        });
        return;
    }

    players.forEach((player, index) => {
        player.teamId = index % 2 === 0 ? 'A' : 'B';
    });
}

function getPlayerCorrectRate(player) {
    const totalAttemptCount = player.totalInputCount + player.errorCount;
    return totalAttemptCount > 0 ? (player.correctCount / totalAttemptCount) * 100 : 0;
}

function getPlayerKpm(player) {
    return player.elapsedTime > 0 ? player.totalInputCount / (player.elapsedTime / 60000) : 0;
}

function getPlayerScoreValue(room, player) {
    if (room.scoreMode === 'correct-rate') return getPlayerCorrectRate(player);
    if (room.scoreMode === 'completed-questions') return player.completedQuestionCount;
    if (room.scoreMode === 'kpm') return getPlayerKpm(player);
    return player.correctCount;
}

function getTeamScoreValue(room, teamId) {
    const members = Array.from(room.players.values()).filter((player) => player.teamId === teamId);
    if (members.length === 0) return 0;
    const totalScore = members.reduce((sum, player) => sum + getPlayerScoreValue(room, player), 0);
    return totalScore / members.length;
}

function comparePlayersByCompetition(room, left, right) {
    if (room.teamMode === 'two-teams') {
        const leftTeamScore = getTeamScoreValue(room, left.teamId);
        const rightTeamScore = getTeamScoreValue(room, right.teamId);
        if (rightTeamScore !== leftTeamScore) return rightTeamScore - leftTeamScore;
        if (left.teamId !== right.teamId) return (left.teamId ?? 'B').localeCompare(right.teamId ?? 'B');
    } else {
        const leftScore = getPlayerScoreValue(room, left);
        const rightScore = getPlayerScoreValue(room, right);
        if (rightScore !== leftScore) return rightScore - leftScore;
    }

    if (left.correctCount !== right.correctCount) return right.correctCount - left.correctCount;
    if (left.totalInputCount !== right.totalInputCount) return right.totalInputCount - left.totalInputCount;
    if (left.errorCount !== right.errorCount) return left.errorCount - right.errorCount;
    return (left.finishedAt ?? Infinity) - (right.finishedAt ?? Infinity);
}

function sortPlayersByCompetition(room) {
    return [...room.players.values()].sort((left, right) => comparePlayersByCompetition(room, left, right));
}

function getCompetitionRank(room, playerId) {
    const sorted = sortPlayersByCompetition(room);
    if (room.teamMode === 'two-teams') {
        const player = room.players.get(playerId);
        if (!player) return null;
        const teams = Array.from(new Set(sorted.map((item) => item.teamId).filter(Boolean)));
        const teamIndex = teams.findIndex((teamId) => teamId === player.teamId);
        return teamIndex >= 0 ? teamIndex + 1 : null;
    }

    const index = sorted.findIndex((player) => player.playerId === playerId);
    return index >= 0 ? index + 1 : null;
}

function toPublicPlayer(player) {
    const correctRate = getPlayerCorrectRate(player);
    return {
        playerId: player.playerId,
        name: player.name,
        isReady: player.isReady,
        teamId: player.teamId,
        currentCharIndex: player.currentCharIndex,
        correctCount: player.correctCount,
        errorCount: player.errorCount,
        totalInputCount: player.totalInputCount,
        completedQuestionCount: player.completedQuestionCount,
        correctRate,
        isCompleted: player.isCompleted,
        elapsedTime: player.elapsedTime,
        finishedAt: player.finishedAt ?? null,
        dbRank: player.dbRank ?? null,
    };
}

function listPublicRooms() {
    return Array.from(rooms.values())
        .filter((room) => room.status === 'waiting' && room.isPublic)
        .map((room) => {
            const host = room.players.get(room.hostPlayerId);
            return {
                roomCode: room.code,
                roomName: room.roomName,
                hostName: host?.name ?? 'Host',
                difficulty: room.difficulty,
                minutes: room.minutes,
                currentPlayers: room.players.size,
                maxPlayers: room.maxPlayers,
                autoStart: room.autoStart,
                teamMode: room.teamMode,
                scoreMode: room.scoreMode,
            };
        })
        .sort((a, b) => b.currentPlayers - a.currentPlayers || a.roomCode.localeCompare(b.roomCode));
}

async function persistMultiplayerResult(room, player, multiplayerRank) {
    if (!tursoClient || player.persistedToDb) return;

    try {
        await ensureDbSchema();

        const totalAttempts = player.totalInputCount + player.errorCount;
        const correctRate = totalAttempts > 0 ? (player.correctCount / totalAttempts) * 100 : 0;
        const errorRate = totalAttempts > 0 ? (player.errorCount / totalAttempts) * 100 : 0;
        const kpm = getPlayerKpm(player);
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
                            completed_question_count,
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
                        toNonNegativeInt(player.completedQuestionCount),
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
    const players = sortPlayersByCompetition(room).map(toPublicPlayer);

    io.to(roomCode).emit('room:state', {
        roomCode: room.code,
        roomName: room.roomName,
        hostPlayerId: room.hostPlayerId,
        difficulty: room.difficulty,
        minutes: room.minutes,
        maxPlayers: room.maxPlayers,
        isPublic: room.isPublic,
        autoStart: room.autoStart,
        teamMode: room.teamMode,
        scoreMode: room.scoreMode,
        status: room.status,
        questionLength: room.question.romaji.length,
        startedAt: room.startedAt ?? null,
        players,
        chatMessages: room.chatMessages,
    });
}

function clearRoomTimers(room) {
    if (room.countdownTimer) {
        clearTimeout(room.countdownTimer);
        room.countdownTimer = null;
    }
    if (room.finishTimer) {
        clearTimeout(room.finishTimer);
        room.finishTimer = null;
    }
}

async function forceFinishRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;

    const forcedFinishedAt = Date.now();
    const durationMs = room.minutes * 60 * 1000;

    room.players.forEach((player) => {
        if (player.isCompleted) return;
        player.isCompleted = true;
        player.finishedAt = forcedFinishedAt;
        player.elapsedTime = Math.max(player.elapsedTime, durationMs);
    });

    for (const player of room.players.values()) {
        const multiplayerRank = getCompetitionRank(room, player.playerId);
        await persistMultiplayerResult(room, player, multiplayerRank);
    }

    room.status = 'finished';
    clearRoomTimers(room);
    emitRoomState(roomCode);
    io.to(roomCode).emit('game:finished');
}

function startGameWithCountdown(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'waiting') return;

    clearRoomTimers(room);
    room.status = 'playing';
    room.startedAt = null;
    room.players.forEach((player) => {
        resetPlayerStatus(player);
    });

    emitRoomState(roomCode);
    io.to(roomCode).emit('game:countdown', {
        seconds: GAME_START_COUNTDOWN_SECONDS,
        startsAt: Date.now() + GAME_START_COUNTDOWN_MS,
    });

    room.countdownTimer = setTimeout(() => {
        const activeRoom = rooms.get(roomCode);
        if (!activeRoom || activeRoom.status !== 'playing') return;

        activeRoom.countdownTimer = null;
        activeRoom.startedAt = Date.now();
        emitRoomState(roomCode);

        io.to(roomCode).emit('game:started', {
            question: activeRoom.question,
            timeLimitSeconds: activeRoom.minutes * 60,
            startedAt: activeRoom.startedAt,
        });

        const durationMs = activeRoom.minutes * 60 * 1000;
        activeRoom.finishTimer = setTimeout(() => {
            forceFinishRoom(roomCode).catch((error) => {
                console.error('[multiplayer] failed to force-finish room', error);
            });
        }, durationMs);
    }, GAME_START_COUNTDOWN_MS);
}

function maybeAutoStart(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'waiting' || !room.autoStart) return;

    const players = Array.from(room.players.values());
    if (players.length < 2) return;

    const nonHostPlayers = players.filter((player) => player.playerId !== room.hostPlayerId);
    if (nonHostPlayers.length === 0) return;

    const everyoneReady = nonHostPlayers.every((player) => player.isReady);
    if (!everyoneReady) return;

    startGameWithCountdown(roomCode);
}

function handleCompletionIfFinished(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;
    const allCompleted = Array.from(room.players.values()).every((player) => player.isCompleted);
    if (!allCompleted) return;

    room.status = 'finished';
    clearRoomTimers(room);
    emitRoomState(roomCode);
    io.to(roomCode).emit('game:finished');
}

io.on('connection', (socket) => {
    socket.on('room:list-public', (_payload, ack) => {
        ack?.({ ok: true, rooms: listPublicRooms() });
    });

    socket.on('room:create', ({ playerName, difficulty, minutes, maxPlayers, isPublic, autoStart, teamMode, scoreMode }, ack) => {
        const roomCode = generateUniqueRoomCode();
        const safeDifficulty = normalizeDifficulty(difficulty);
        const safeMinutes = normalizeMinutes(minutes);
        const safeMaxPlayers = normalizeMaxPlayers(maxPlayers);
        const safeIsPublic = normalizeBoolean(isPublic, true);
        const safeAutoStart = normalizeBoolean(autoStart, false);
        const safeTeamMode = normalizeTeamMode(teamMode);
        const question = pickQuestion(safeDifficulty);
        const playerId = socket.id;

        const room = {
            code: roomCode,
            roomName: makeRoomName(),
            hostPlayerId: playerId,
            difficulty: safeDifficulty,
            minutes: safeMinutes,
            maxPlayers: safeMaxPlayers,
            isPublic: safeIsPublic,
            autoStart: safeAutoStart,
            teamMode: safeTeamMode,
            scoreMode: normalizeScoreMode(scoreMode),
            status: 'waiting',
            question,
            startedAt: null,
            countdownTimer: null,
            finishTimer: null,
            chatMessages: [],
            players: new Map(),
        };

        room.players.set(playerId, {
            playerId,
            socketId: socket.id,
            name: sanitizePlayerName(playerName, 'Host'),
            isReady: false,
            teamId: safeTeamMode === 'two-teams' ? 'A' : null,
            currentCharIndex: 0,
            correctCount: 0,
            errorCount: 0,
            totalInputCount: 0,
            completedQuestionCount: 0,
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

        ack?.({ ok: true, roomCode, playerId, question, roomName: room.roomName });
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
        if (room.players.size >= room.maxPlayers) {
            ack?.({ ok: false, message: 'ルームが満員です。' });
            return;
        }

        const playerId = socket.id;
        room.players.set(playerId, {
            playerId,
            socketId: socket.id,
            name: sanitizePlayerName(playerName, 'Player'),
            isReady: false,
            teamId: room.teamMode === 'two-teams' ? (room.players.size % 2 === 0 ? 'A' : 'B') : null,
            currentCharIndex: 0,
            correctCount: 0,
            errorCount: 0,
            totalInputCount: 0,
            completedQuestionCount: 0,
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

    socket.on('room:chat', ({ roomCode, content }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        if (normalizedCode !== socket.data.roomCode) {
            ack?.({ ok: false, message: 'ルームに参加していません。' });
            return;
        }

        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: 'ロビーでのみチャットできます。' });
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            ack?.({ ok: false, message: '参加プレイヤーではありません。' });
            return;
        }

        const normalizedContent = normalizeChatContent(content);
        if (!normalizedContent) {
            ack?.({ ok: false, message: 'メッセージを入力してください。' });
            return;
        }

        room.chatMessages.push({
            id: `${Date.now()}-${socket.id}-${room.chatMessages.length + 1}`,
            playerId: player.playerId,
            playerName: player.name,
            content: normalizedContent,
            sentAt: Date.now(),
        });
        if (room.chatMessages.length > MAX_CHAT_MESSAGES) {
            room.chatMessages.splice(0, room.chatMessages.length - MAX_CHAT_MESSAGES);
        }

        emitRoomState(normalizedCode);
        ack?.({ ok: true });
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
        if (room.players.size < 2) {
            ack?.({ ok: false, message: '2人以上で開始してください。' });
            return;
        }

        startGameWithCountdown(normalizedCode);
        ack?.({ ok: true });
    });

    socket.on('room:update-settings', ({ roomCode, difficulty, minutes, maxPlayers, isPublic, autoStart, teamMode, scoreMode }, ack) => {
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
        room.maxPlayers = Math.max(room.players.size, normalizeMaxPlayers(maxPlayers ?? room.maxPlayers));
        room.isPublic = normalizeBoolean(isPublic, room.isPublic);
        room.autoStart = normalizeBoolean(autoStart, room.autoStart);
        room.teamMode = normalizeTeamMode(teamMode ?? room.teamMode);
        room.scoreMode = normalizeScoreMode(scoreMode ?? room.scoreMode);
        assignTeamsForRoom(room);
        room.question = pickQuestion(room.difficulty);
        emitRoomState(normalizedCode);
        maybeAutoStart(normalizedCode);
        ack?.({ ok: true, question: room.question });
    });

    socket.on('room:set-ready', ({ roomCode, isReady }, ack) => {
        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
            ack?.({ ok: false, message: 'ルームが見つかりません。' });
            return;
        }
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '待機中のみ準備できます。' });
            return;
        }
        if (room.hostPlayerId === socket.id) {
            ack?.({ ok: false, message: 'ホストは準備完了できません。' });
            return;
        }

        const player = room.players.get(socket.id);
        if (!player) {
            ack?.({ ok: false, message: '参加プレイヤーではありません。' });
            return;
        }

        player.isReady = normalizeBoolean(isReady, !player.isReady);
        emitRoomState(normalizedCode);
        maybeAutoStart(normalizedCode);
        ack?.({ ok: true });
    });

    socket.on('room:set-team', ({ roomCode, targetPlayerId, teamId }, ack) => {
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
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '待機中のみチーム変更できます。' });
            return;
        }
        if (room.teamMode !== 'two-teams') {
            ack?.({ ok: false, message: '2チームモードでのみ変更できます。' });
            return;
        }

        const player = room.players.get(String(targetPlayerId ?? ''));
        if (!player) {
            ack?.({ ok: false, message: '対象プレイヤーが見つかりません。' });
            return;
        }

        player.teamId = teamId === 'B' ? 'B' : 'A';
        emitRoomState(normalizedCode);
        ack?.({ ok: true });
    });

    socket.on('room:kick', ({ roomCode, targetPlayerId }, ack) => {
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
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '待機中のみキックできます。' });
            return;
        }

        const targetId = String(targetPlayerId ?? '');
        if (!targetId || targetId === room.hostPlayerId) {
            ack?.({ ok: false, message: 'ホストはキックできません。' });
            return;
        }

        const targetPlayer = room.players.get(targetId);
        if (!targetPlayer) {
            ack?.({ ok: false, message: '対象プレイヤーが見つかりません。' });
            return;
        }

        const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
        if (targetSocket) {
            targetSocket.leave(normalizedCode);
            targetSocket.data.roomCode = undefined;
            targetSocket.data.playerId = undefined;
            targetSocket.emit('room:kicked', { roomCode: normalizedCode });
        }

        room.players.delete(targetId);
        emitRoomState(normalizedCode);
        ack?.({ ok: true });
    });

    socket.on('room:transfer-host', ({ roomCode, targetPlayerId }, ack) => {
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
        if (room.status !== 'waiting') {
            ack?.({ ok: false, message: '待機中のみホスト権限を譲渡できます。' });
            return;
        }

        const targetId = String(targetPlayerId ?? '');
        if (!targetId || targetId === room.hostPlayerId) {
            ack?.({ ok: false, message: '譲渡先プレイヤーを指定してください。' });
            return;
        }

        const targetPlayer = room.players.get(targetId);
        if (!targetPlayer) {
            ack?.({ ok: false, message: '対象プレイヤーが見つかりません。' });
            return;
        }

        room.hostPlayerId = targetId;
        room.players.forEach((player) => {
            player.isReady = false;
        });

        emitRoomState(normalizedCode);
        ack?.({ ok: true });
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

        clearRoomTimers(room);
        room.status = 'waiting';
        room.startedAt = null;
        room.question = pickQuestion(room.difficulty);
        room.players.forEach((player) => resetPlayerStatus(player));
        emitRoomState(normalizedCode);
        maybeAutoStart(normalizedCode);
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
        const nextCompletedQuestionCount = toNonNegativeInt(progress?.completedQuestionCount);
        player.currentCharIndex = Math.max(player.currentCharIndex, nextCurrent);
        player.correctCount = Math.max(player.correctCount, nextCorrect);
        player.totalInputCount = Math.max(player.totalInputCount, nextTotal);
        player.errorCount = Math.max(player.errorCount, nextError);
        player.completedQuestionCount = Math.max(player.completedQuestionCount, nextCompletedQuestionCount);
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
        player.completedQuestionCount = Math.max(player.completedQuestionCount, toNonNegativeInt(stats?.completedQuestionCount));
        player.elapsedTime = Math.max(player.elapsedTime, toNonNegativeInt(stats?.elapsedTime));
        player.isCompleted = true;
        player.finishedAt = Date.now();

        const multiplayerRank = getCompetitionRank(room, player.playerId);
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
            clearRoomTimers(room);
            rooms.delete(roomCode);
            return;
        }

        if (room.hostPlayerId === socket.id) {
            const nextHost = room.players.values().next().value;
            room.hostPlayerId = nextHost.playerId;
        }

        if (room.status === 'waiting') {
            assignTeamsForRoom(room);
        }

        emitRoomState(roomCode);
    });
});

server.listen(PORT, () => {
    console.log(`[multiplayer] socket server listening on :${PORT}`);
});
