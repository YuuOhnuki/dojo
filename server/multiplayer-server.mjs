import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 4001);
const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000';
const MAX_PLAYERS_PER_ROOM = 12;
const MINUTES_MIN = 1;
const MINUTES_MAX = 5;
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

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
    };
}

function emitRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    const players = Array.from(room.players.values())
        .map(toPublicPlayer)
        .sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1;
            return b.currentCharIndex - a.currentCharIndex;
        });

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

    socket.on('game:complete', ({ roomCode, stats }) => {
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
