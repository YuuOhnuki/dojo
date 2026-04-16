'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Crown, DoorOpen, Flag, Home, LogIn, Plus, RefreshCw, Swords } from 'lucide-react';
import { TypingDisplay } from '@/components/TypingDisplay';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Difficulty, Question } from '@/types/typing';
import { GameStartedPayload, MultiplayerRoomState } from '@/types/multiplayer';
import questionsData from '@/data/questions.json';

const SOCKET_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';
const HEALTH_CHECK_URL = 'https://dojo-597h.onrender.com/health';
const DEFAULT_PLAYER_NAME = 'Player';
const DEFAULT_HOST_NAME = 'Host';
const MINUTES_MIN = 1;
const MINUTES_MAX = 5;
const ROOM_CODE_LENGTH = 3;

const difficultyOptions: { key: Difficulty; label: string }[] = [
    { key: 'easy', label: '初級' },
    { key: 'medium', label: '中級' },
    { key: 'hard', label: '上級' },
];

type Mode = 'menu' | 'lobby' | 'playing' | 'finished';
type MenuView = 'create' | 'join';

interface RoomActionAck {
    ok: boolean;
    message?: string;
}

interface JoinCreateAck extends RoomActionAck {
    roomCode?: string;
    playerId?: string;
    question?: Question;
}

interface UpdateSettingsAck extends RoomActionAck {
    question?: Question;
}

/**
 * ルームコード入力を 3 桁数字に正規化する。
 */
const normalizeRoomCode = (value: string): string => value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH);

/**
 * ユーザー名をトリム・長さ制限して送信値を安定化する。
 */
const normalizePlayerName = (value: string, fallback: string): string => {
    const normalized = value.trim().slice(0, 16);
    return normalized || fallback;
};

/**
 * 時間(分)を許可範囲に丸めて不正な UI 値混入を防ぐ。
 */
const clampMinutes = (value: number): number => Math.max(MINUTES_MIN, Math.min(MINUTES_MAX, Math.round(value)));

export const MultiPlayScreen: React.FC<{ onBackToHome?: () => void }> = ({ onBackToHome }) => {
    const socketRef = useRef<Socket | null>(null);
    const [mode, setMode] = useState<Mode>('menu');
    const [menuView, setMenuView] = useState<MenuView>('create');
    const [playerName, setPlayerName] = useState('Player');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [minutes, setMinutes] = useState(1);
    const [roomState, setRoomState] = useState<MultiplayerRoomState | null>(null);
    const [question, setQuestion] = useState<Question | null>(null);
    const [playerId, setPlayerId] = useState<string>('');
    const [timeLimit, setTimeLimit] = useState(60);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
    const [correctCount, setCorrectCount] = useState(0);
    const [totalInputCount, setTotalInputCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [currentQuestionProgress, setCurrentQuestionProgress] = useState(0);
    const [totalCharProgress, setTotalCharProgress] = useState(0);
    const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [stayInRoom, setStayInRoom] = useState(false);
    const completionSentRef = useRef(false);
    const [serverOnline, setServerOnline] = useState<boolean | null>(null);

    const isHost = roomState?.hostPlayerId === playerId;
    const currentRoomCode = roomState?.roomCode ?? '';

    const ensureSocket = useCallback(() => {
        if (socketRef.current) return socketRef.current;
        const socket = io(SOCKET_URL, { transports: ['websocket'] });
        socketRef.current = socket;
        return socket;
    }, []);

    const getRandomQuestion = useCallback((targetDifficulty: Difficulty): Question => {
        const questionMap = (questionsData as unknown as { questions: Record<string, Question[]> }).questions;
        const list = questionMap[targetDifficulty] || [];
        if (list.length === 0) {
            return {
                id: 'default',
                difficulty: 'easy',
                japanese: 'テスト',
                romaji: 'tesuto',
            };
        }
        return list[Math.floor(Math.random() * list.length)];
    }, []);

    useEffect(() => {
        const socket = ensureSocket();

        socket.on('room:state', (payload: MultiplayerRoomState) => {
            setRoomState(payload);
            setDifficulty(payload.difficulty);
            setMinutes(payload.minutes);
            if (payload.status === 'waiting') setMode('lobby');
            if (payload.status === 'finished') setMode('finished');
        });

        socket.on('game:started', (payload: GameStartedPayload) => {
            setQuestion(payload.question);
            setTimeLimit(payload.timeLimitSeconds);
            setElapsedTime(0);
            setGameStartedAt(payload.startedAt);
            setCorrectCount(0);
            setTotalInputCount(0);
            setErrorCount(0);
            setCurrentQuestionProgress(0);
            setTotalCharProgress(0);
            setCompletedQuestionCount(0);
            completionSentRef.current = false;
            setMode('playing');
        });

        socket.on('game:finished', () => {
            setMode('finished');
        });

        return () => {
            socket.off('room:state');
            socket.off('game:started');
            socket.off('game:finished');
        };
    }, [ensureSocket]);

    useEffect(() => {
        if (mode !== 'playing' || gameStartedAt === null) return;
        const interval = setInterval(() => {
            const nextElapsed = Math.min(Math.floor((Date.now() - gameStartedAt) / 1000), timeLimit);
            setElapsedTime(nextElapsed);
        }, 200);
        return () => clearInterval(interval);
    }, [gameStartedAt, mode, timeLimit]);

    useEffect(() => {
        if (mode !== 'playing' || !roomState || completionSentRef.current) return;
        if (elapsedTime < timeLimit) return;

        const socket = ensureSocket();
        socket.emit('game:complete', {
            roomCode: roomState.roomCode,
            stats: {
                currentCharIndex: totalCharProgress,
                correctCount,
                totalInputCount,
                errorCount,
                elapsedTime: elapsedTime * 1000,
            },
        });
        completionSentRef.current = true;
    }, [
        correctCount,
        elapsedTime,
        ensureSocket,
        errorCount,
        mode,
        roomState,
        timeLimit,
        totalCharProgress,
        totalInputCount,
    ]);

    useEffect(() => {
        return () => {
            socketRef.current?.disconnect();
            socketRef.current = null;
        };
    }, []);

    useEffect(() => {
        const checkServerHealth = async () => {
            try {
                const response = await fetch(HEALTH_CHECK_URL);
                console.log('Health check response:', response);
                setServerOnline(response.ok);
            } catch {
                setServerOnline(false);
            }
        };
        checkServerHealth();
    }, []);

    const createRoom = useCallback(() => {
        setErrorMessage('');
        const socket = ensureSocket();
        const safePlayerName = normalizePlayerName(playerName, DEFAULT_HOST_NAME);
        socket.emit(
            'room:create',
            {
                playerName: safePlayerName,
                difficulty,
                minutes: clampMinutes(minutes),
            },
            (response: JoinCreateAck) => {
                if (!response.ok) {
                    setErrorMessage(response.message ?? 'ルーム作成に失敗しました。');
                    return;
                }
                setPlayerId(response.playerId ?? '');
                setQuestion(response.question ?? null);
                setMode('lobby');
                setMenuView('create');
            },
        );
    }, [difficulty, ensureSocket, minutes, playerName]);

    const joinRoom = useCallback(() => {
        setErrorMessage('');
        const normalizedRoomCode = roomCodeInput;
        if (normalizedRoomCode.length !== ROOM_CODE_LENGTH) {
            setErrorMessage('ルームコードは3桁の数字で入力してください。');
            return;
        }

        const socket = ensureSocket();
        const safePlayerName = normalizePlayerName(playerName, DEFAULT_PLAYER_NAME);
        socket.emit(
            'room:join',
            {
                roomCode: normalizedRoomCode,
                playerName: safePlayerName,
            },
            (response: JoinCreateAck) => {
                if (!response.ok) {
                    setErrorMessage(response.message ?? '入室に失敗しました。');
                    return;
                }
                setPlayerId(response.playerId ?? '');
                setQuestion(response.question ?? null);
                setMode('lobby');
                setMenuView('create');
            },
        );
    }, [ensureSocket, playerName, roomCodeInput]);

    const startRace = useCallback(() => {
        if (!roomState) return;
        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit('room:start', { roomCode: roomState.roomCode }, (response: RoomActionAck) => {
            if (!response.ok) {
                setErrorMessage(response.message ?? '開始に失敗しました。');
            }
        });
    }, [ensureSocket, roomState]);

    const updateLobbySettings = useCallback(() => {
        if (!roomState) return;
        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit(
            'room:update-settings',
            {
                roomCode: roomState.roomCode,
                difficulty,
                minutes: clampMinutes(minutes),
            },
            (response: UpdateSettingsAck) => {
                if (!response.ok) {
                    setErrorMessage(response.message ?? '設定更新に失敗しました。');
                    return;
                }
                if (response.question) {
                    setQuestion(response.question);
                }
            },
        );
    }, [difficulty, ensureSocket, minutes, roomState]);

    const reopenLobby = useCallback(() => {
        if (!roomState) return;
        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit('room:reopen', { roomCode: roomState.roomCode }, (response: UpdateSettingsAck) => {
            if (!response.ok) {
                setErrorMessage(response.message ?? 'ロビーに戻せませんでした。');
                return;
            }
            if (response.question) {
                setQuestion(response.question);
            }
            setStayInRoom(false);
        });
    }, [ensureSocket, roomState]);

    const handleProgress = useCallback(
        (state: { currentIndex: number }) => {
            if (!roomState) return;
            const delta = state.currentIndex - currentQuestionProgress;
            if (delta <= 0) return;
            const nextCorrect = correctCount + delta;
            const nextTotal = totalInputCount + delta;
            const nextTotalCharProgress = totalCharProgress + delta;
            setCurrentQuestionProgress(state.currentIndex);
            setCorrectCount(nextCorrect);
            setTotalInputCount(nextTotal);
            setTotalCharProgress(nextTotalCharProgress);

            const socket = ensureSocket();
            socket.emit('game:progress', {
                roomCode: roomState.roomCode,
                progress: {
                    currentCharIndex: nextTotalCharProgress,
                    correctCount: nextCorrect,
                    totalInputCount: nextTotal,
                    errorCount,
                },
            });
        },
        [
            correctCount,
            currentQuestionProgress,
            ensureSocket,
            errorCount,
            roomState,
            totalCharProgress,
            totalInputCount,
        ],
    );

    const handleError = useCallback(() => {
        if (!roomState) return;
        const nextErrorCount = errorCount + 1;
        setErrorCount(nextErrorCount);
        const socket = ensureSocket();
        socket.emit('game:progress', {
            roomCode: roomState.roomCode,
            progress: {
                currentCharIndex: totalCharProgress,
                correctCount,
                totalInputCount,
                errorCount: nextErrorCount,
            },
        });
    }, [correctCount, ensureSocket, errorCount, roomState, totalCharProgress, totalInputCount]);

    const handleComplete = useCallback(() => {
        if (mode !== 'playing') return;
        const activeDifficulty = roomState?.difficulty ?? difficulty;
        setCompletedQuestionCount((prev) => prev + 1);
        setCurrentQuestionProgress(0);
        setQuestion(getRandomQuestion(activeDifficulty));
    }, [difficulty, getRandomQuestion, mode, roomState?.difficulty]);

    const ranking = useMemo(() => {
        if (!roomState) return [];
        return [...roomState.players].sort((a, b) => {
            if (a.isCompleted !== b.isCompleted) return a.isCompleted ? -1 : 1;
            if (a.isCompleted && b.isCompleted) return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
            return b.currentCharIndex - a.currentCharIndex;
        });
    }, [roomState]);

    const progressMax = useMemo(() => {
        const maxFromPlayers = ranking.reduce((maxValue, player) => Math.max(maxValue, player.currentCharIndex), 0);
        return Math.max(maxFromPlayers, totalCharProgress, 1);
    }, [ranking, totalCharProgress]);

    const myResult = useMemo(() => {
        if (!roomState) return null;
        const player = roomState.players.find((item) => item.playerId === playerId);
        if (!player) return null;
        const kpm = player.elapsedTime > 0 ? player.totalInputCount / (player.elapsedTime / 60000) : 0;
        return {
            ...player,
            kpm,
        };
    }, [playerId, roomState]);

    if (mode === 'menu') {
        return (
            <div className="h-dvh flex items-center justify-center px-4 py-3 overflow-hidden">
                <div className="surface-card w-full max-w-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl md:text-2xl font-light">マルチプレイ</h2>
                        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <span>サーバー</span>
                            <span
                                className={`size-2.5 rounded-full ${
                                    serverOnline === null
                                        ? 'bg-muted-foreground/50 animate-soft-pulse'
                                        : serverOnline
                                          ? 'bg-emerald-500'
                                          : 'bg-red-500'
                                }`}
                            />
                        </div>
                    </div>
                    <div className="surface-muted p-1 grid grid-cols-2 gap-1">
                        <Button
                            type="button"
                            onClick={() => setMenuView('create')}
                            variant={menuView === 'create' ? 'secondary' : 'ghost'}
                            className="rounded-lg"
                        >
                            <Plus className="size-4" />
                            ルーム作成
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setMenuView('join')}
                            variant={menuView === 'join' ? 'secondary' : 'ghost'}
                            className="rounded-lg"
                        >
                            <LogIn className="size-4" />
                            ルーム参加
                        </Button>
                    </div>
                    {menuView === 'create' && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">プレイヤー名</div>
                                <input
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    className="surface-input w-full px-3 py-2"
                                    placeholder="名前を入力"
                                    maxLength={16}
                                />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="text-sm text-muted-foreground">難易度</div>
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                                        className="surface-input w-full px-3 py-2"
                                    >
                                        {difficultyOptions.map((item) => (
                                            <option key={item.key} value={item.key}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-sm text-muted-foreground">制限時間（分）</div>
                                    <div className="surface-muted px-3 py-2.5">
                                        <input
                                            type="range"
                                            min={1}
                                            max={5}
                                            step={1}
                                            value={minutes}
                                            onChange={(e) => setMinutes(clampMinutes(Number(e.target.value)))}
                                            className="w-full accent-primary"
                                            aria-label="制限時間"
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>1分</span>
                                            <span className="font-semibold text-foreground">{minutes}分</span>
                                            <span>5分</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <ActionButtonRow>
                                <ActionButton
                                    onClick={createRoom}
                                    icon={Plus}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    作成してロビーへ
                                </ActionButton>
                                <ActionButton onClick={onBackToHome} variant="outline" icon={Home}>
                                    戻る
                                </ActionButton>
                            </ActionButtonRow>
                        </div>
                    )}

                    {menuView === 'join' && (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">プレイヤー名</div>
                                <input
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    className="surface-input w-full px-3 py-2"
                                    placeholder="名前を入力"
                                    maxLength={16}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">3桁ルームコード</div>
                                <div className="flex justify-center">
                                    <InputOTP
                                        maxLength={3}
                                        value={roomCodeInput}
                                        onChange={(value) => setRoomCodeInput(normalizeRoomCode(value))}
                                        className="justify-center"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                    >
                                        <InputOTPGroup className="gap-2">
                                            <InputOTPSlot
                                                index={0}
                                                className="h-11 w-11 rounded-md border border-border/75 bg-card/65 text-lg font-semibold shadow-sm first:border-l backdrop-blur-sm"
                                            />
                                            <InputOTPSlot
                                                index={1}
                                                className="h-11 w-11 rounded-md border border-border/75 bg-card/65 text-lg font-semibold shadow-sm backdrop-blur-sm"
                                            />
                                            <InputOTPSlot
                                                index={2}
                                                className="h-11 w-11 rounded-md border border-border/75 bg-card/65 text-lg font-semibold shadow-sm backdrop-blur-sm"
                                            />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                            </div>
                            <ActionButtonRow>
                                <ActionButton
                                    onClick={joinRoom}
                                    icon={DoorOpen}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    入室
                                </ActionButton>
                                <ActionButton onClick={onBackToHome} variant="outline" icon={Home}>
                                    戻る
                                </ActionButton>
                            </ActionButtonRow>
                        </div>
                    )}
                    {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
                </div>
            </div>
        );
    }

    if (mode === 'lobby') {
        return (
            <div className="h-dvh p-3 md:p-4 overflow-hidden">
                <div className="surface-card max-w-3xl mx-auto h-full p-4 md:p-5 space-y-4 animate-fade-up-soft overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl md:text-2xl font-light">ルーム待機中</h2>
                        <div className="text-sm text-muted-foreground">
                            ルームコード:
                            <span className="ml-2 font-semibold text-lg md:text-xl tracking-widest">{currentRoomCode}</span>
                        </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        {isHost ? 'あなたはホストです。全員が揃ったらレース開始。' : 'ホストの開始を待っています。'}
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">参加者 ({ranking.length})</div>
                        <div className="max-h-56 md:max-h-64 overflow-y-auto space-y-2">
                            {ranking.map((player, idx) => (
                                <div
                                    key={player.playerId}
                                    className={`rounded border border-border px-3 py-2 flex justify-between ${
                                        player.playerId === playerId ? 'bg-blue-500/10 border-blue-500/40' : ''
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <span
                                            className={`mr-2 text-sm font-semibold ${
                                                idx === 0
                                                    ? 'text-yellow-600'
                                                    : idx === 1
                                                      ? 'text-gray-400'
                                                      : idx === 2
                                                        ? 'text-amber-600'
                                                        : 'text-gray-500'
                                            }`}
                                        >
                                            {idx + 1}.
                                        </span>
                                        {player.playerId === roomState?.hostPlayerId && (
                                            <Crown className="mr-2 w-4 h-4 text-yellow-500" />
                                        )}
                                        {player.name}

                                        {player.playerId === playerId && (
                                            <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1 rounded">
                                                YOU
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {player.isCompleted ? '完了' : '待機中'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="surface-muted p-3.5 space-y-3">
                        <div className="text-sm text-muted-foreground">ロビー設定</div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">難易度</div>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                                    className="surface-input w-full px-3 py-2 disabled:bg-muted/50 disabled:backdrop-blur-0"
                                    disabled={!isHost}
                                >
                                    {difficultyOptions.map((item) => (
                                        <option key={item.key} value={item.key}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">制限時間（分）</div>
                                <div className="surface-muted px-3 py-2.5">
                                    <input
                                        type="range"
                                        min={1}
                                        max={5}
                                        step={1}
                                        value={minutes}
                                        onChange={(e) => setMinutes(clampMinutes(Number(e.target.value)))}
                                        className="w-full accent-primary disabled:opacity-40"
                                        aria-label="制限時間"
                                        disabled={!isHost}
                                    />
                                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>1分</span>
                                        <span className="font-semibold text-foreground">{minutes}分</span>
                                        <span>5分</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {isHost ? (
                            <ActionButton onClick={updateLobbySettings} variant="outline" icon={RefreshCw}>
                                設定を反映
                            </ActionButton>
                        ) : (
                            <div className="text-xs text-muted-foreground">設定変更はホストのみ可能です。</div>
                        )}
                    </div>

                    <ActionButtonRow cols={2}>
                        {isHost && (
                            <ActionButton
                                onClick={startRace}
                                icon={Flag}
                                className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                                レース開始
                            </ActionButton>
                        )}
                        <ActionButton onClick={onBackToHome} variant="outline" icon={Home}>
                            ホームへ
                        </ActionButton>
                    </ActionButtonRow>
                    {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
                </div>
            </div>
        );
    }

    if (mode === 'playing' && question) {
        return (
            <div className="h-dvh p-3 md:p-4 overflow-hidden animate-fade-up-soft">
                <div className="max-w-5xl mx-auto h-full space-y-4 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-light">マルチプレイレース</h2>
                            <div className="text-sm text-muted-foreground">
                                ルームコード:
                                <span className="ml-2 font-semibold text-lg md:text-xl tracking-widest">{currentRoomCode}</span>
                            </div>
                        </div>
                        <ActionButton onClick={onBackToHome} variant="outline" className="w-auto" icon={Home}>
                            退出
                        </ActionButton>
                    </div>

                    <ProgressBar timeLimit={timeLimit} elapsedSeconds={elapsedTime} />

                    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                        <div className="surface-muted p-4">
                            <TypingDisplay
                                key={`${question.id}-${completedQuestionCount}`}
                                japanese={question.japanese}
                                romaji={question.romaji}
                                alternatives={question.alternatives}
                                accentColor="blue"
                                onProgress={handleProgress}
                                onError={handleError}
                                onComplete={handleComplete}
                            />
                        </div>

                        <div className="surface-card p-3.5 space-y-2.5">
                            <div className="text-sm text-muted-foreground">リアルタイム進捗 ({ranking.length})</div>
                            <div className="max-h-72 md:max-h-80 overflow-y-auto space-y-2.5">
                                {ranking.map((player, idx) => (
                                    <div
                                        key={player.playerId}
                                        className={`rounded border border-border p-3 space-y-1 ${
                                            player.playerId === playerId ? 'bg-blue-500/10 border-blue-500/40' : ''
                                        }`}
                                    >
                                        <div className="flex justify-between text-sm">
                                            <span className="flex items-center">
                                                <span
                                                    className={`mr-2 font-semibold ${
                                                        idx === 0
                                                            ? 'text-yellow-600'
                                                            : idx === 1
                                                              ? 'text-gray-400'
                                                              : idx === 2
                                                                ? 'text-amber-600'
                                                                : 'text-gray-500'
                                                    }`}
                                                >
                                                    {idx + 1}.
                                                </span>
                                                {player.name}
                                                {player.playerId === playerId && (
                                                    <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1 rounded">
                                                        YOU
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {player.isCompleted ? '完了' : '進行中'}
                                            </span>
                                        </div>
                                        <div className="h-2 rounded bg-muted overflow-hidden">
                                            <div
                                                className="h-full bg-foreground/80 transition-all duration-200"
                                                style={{
                                                    width: `${Math.min((player.currentCharIndex / progressMax) * 100, 100)}%`,
                                                }}
                                            />
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            文字数: {player.currentCharIndex} / 正解率: {player.correctRate.toFixed(1)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
            <div className="h-dvh flex items-center justify-center px-4 py-3 overflow-hidden animate-fade-up-soft">
            <div className="surface-card w-full max-w-xl p-5 space-y-3.5 overflow-y-auto">
                <h2 className="text-xl md:text-2xl font-light">レース結果</h2>
                <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">ランキング ({ranking.length})</div>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                        {ranking.map((player, index) => (
                            <div
                                key={player.playerId}
                                className={`rounded border border-border px-3 py-2 flex justify-between ${
                                    player.playerId === playerId ? 'bg-blue-500/10 border-blue-500/40' : ''
                                }`}
                            >
                                <div className="flex items-center">
                                    <span
                                        className={`mr-2 font-semibold ${
                                            index === 0
                                                ? 'text-yellow-600'
                                                : index === 1
                                                  ? 'text-gray-400'
                                                  : index === 2
                                                    ? 'text-amber-600'
                                                    : 'text-gray-500'
                                        }`}
                                    >
                                        {index + 1}.
                                    </span>
                                    {player.name}
                                    {player.playerId === playerId && (
                                        <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1 rounded">YOU</span>
                                    )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    文字数: {player.currentCharIndex} / 正解率: {player.correctRate.toFixed(1)}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {myResult && (
                    <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/10 p-4 space-y-2">
                        <div className="text-sm font-semibold text-blue-700 dark:text-blue-300">あなたの成績</div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-foreground/90">
                            <div>正タイプ数: {myResult.totalInputCount}</div>
                            <div>誤タイプ数: {myResult.errorCount}</div>
                            <div>正解率: {myResult.correctRate.toFixed(1)}%</div>
                            <div>KPM: {myResult.kpm.toFixed(1)}</div>
                        </div>
                    </div>
                )}

                <ActionButtonRow cols={2}>
                    <ActionButton
                        onClick={onBackToHome}
                        icon={Home}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        ホームに戻る
                    </ActionButton>
                    <ActionButton
                        onClick={() => {
                            setStayInRoom(true);
                            if (isHost) {
                                reopenLobby();
                            }
                        }}
                        variant="outline"
                        icon={Swords}
                    >
                        ロビーに残る
                    </ActionButton>
                </ActionButtonRow>
                {!isHost && stayInRoom && (
                    <div className="text-xs text-muted-foreground">ホストがロビーを開くまで待機します。</div>
                )}
            </div>
        </div>
    );
};
