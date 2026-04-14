import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT ?? process.env.MULTIPLAYER_PORT ?? 4001);
const CLIENT_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'http://localhost:3000';

const dataPath = path.join(process.cwd(), 'data', 'questions.json');
const questionsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const rooms = new Map();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'dojo-multiplayer-socket' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false }));
});
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

function makeRoomCode() {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
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
  const correctRate = player.totalInputCount > 0 ? (player.correctCount / player.totalInputCount) * 100 : 0;
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
    const question = pickQuestion(difficulty);
    const playerId = socket.id;

    const room = {
      code: roomCode,
      hostPlayerId: playerId,
      difficulty,
      minutes,
      status: 'waiting',
      question,
      startedAt: null,
      players: new Map(),
    };

    room.players.set(playerId, {
      playerId,
      socketId: socket.id,
      name: playerName || 'Host',
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
    const normalizedCode = String(roomCode ?? '').replace(/\D/g, '').slice(0, 3);
    const room = rooms.get(normalizedCode);
    if (!room) {
      ack?.({ ok: false, message: 'ルームが見つかりません。' });
      return;
    }
    if (room.status !== 'waiting') {
      ack?.({ ok: false, message: '既に開始済みのルームです。' });
      return;
    }

    const playerId = socket.id;
    room.players.set(playerId, {
      playerId,
      socketId: socket.id,
      name: playerName || 'Player',
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
    const room = rooms.get(roomCode);
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
    emitRoomState(roomCode);
    io.to(roomCode).emit('game:started', {
      question: room.question,
      timeLimitSeconds: room.minutes * 60,
      startedAt: room.startedAt,
    });
    ack?.({ ok: true });
  });

  socket.on('room:update-settings', ({ roomCode, difficulty, minutes }, ack) => {
    const room = rooms.get(roomCode);
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

    room.difficulty = difficulty ?? room.difficulty;
    room.minutes = minutes ?? room.minutes;
    room.question = pickQuestion(room.difficulty);
    emitRoomState(roomCode);
    ack?.({ ok: true, question: room.question });
  });

  socket.on('room:reopen', ({ roomCode }, ack) => {
    const room = rooms.get(roomCode);
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
    emitRoomState(roomCode);
    ack?.({ ok: true, question: room.question });
  });

  socket.on('game:progress', ({ roomCode, progress }) => {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player || player.isCompleted) return;

    player.currentCharIndex = progress.currentCharIndex ?? player.currentCharIndex;
    player.correctCount = progress.correctCount ?? player.correctCount;
    player.totalInputCount = progress.totalInputCount ?? player.totalInputCount;
    player.errorCount = progress.errorCount ?? player.errorCount;
    player.elapsedTime = room.startedAt ? Date.now() - room.startedAt : 0;

    emitRoomState(roomCode);
  });

  socket.on('game:complete', ({ roomCode, stats }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    player.currentCharIndex = stats.currentCharIndex ?? player.currentCharIndex;
    player.correctCount = stats.correctCount ?? player.correctCount;
    player.totalInputCount = stats.totalInputCount ?? player.totalInputCount;
    player.errorCount = stats.errorCount ?? player.errorCount;
    player.elapsedTime = stats.elapsedTime ?? player.elapsedTime;
    player.isCompleted = true;
    player.finishedAt = Date.now();

    emitRoomState(roomCode);
    handleCompletionIfFinished(roomCode);
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
