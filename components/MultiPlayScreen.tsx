'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TypingDisplay } from '@/components/TypingDisplay';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { Difficulty, Question } from '@/types/typing';
import { GameStartedPayload, MultiplayerRoomState } from '@/types/multiplayer';
import questionsData from '@/data/questions.json';

const SOCKET_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';

const difficultyOptions: { key: Difficulty; label: string }[] = [
    { key: 'easy', label: '初級' },
    { key: 'medium', label: '中級' },
    { key: 'hard', label: '上級' },
];

type Mode = 'menu' | 'lobby' | 'playing' | 'finished';
type MenuView = 'create' | 'join';

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
    const [currentQuestionProgress, setCurrentQuestionProgress] = useState(0);
    const [totalCharProgress, setTotalCharProgress] = useState(0);
    const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [stayInRoom, setStayInRoom] = useState(false);
    const completionSentRef = useRef(false);

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
                errorCount: totalInputCount - correctCount,
                elapsedTime: elapsedTime * 1000,
            },
        });
        completionSentRef.current = true;
    }, [correctCount, totalCharProgress, elapsedTime, ensureSocket, mode, roomState, timeLimit, totalInputCount]);

    useEffect(() => {
        return () => {
            socketRef.current?.disconnect();
            socketRef.current = null;
        };
    }, []);

    const createRoom = useCallback(() => {
        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit(
            'room:create',
            {
                playerName: playerName.trim() || 'Host',
                difficulty,
                minutes,
            },
            (response: {
                ok: boolean;
                roomCode?: string;
                playerId?: string;
                question?: Question;
                message?: string;
            }) => {
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
        const socket = ensureSocket();
        socket.emit(
            'room:join',
            {
                roomCode: roomCodeInput.trim().toUpperCase(),
                playerName: playerName.trim() || 'Player',
            },
            (response: {
                ok: boolean;
                roomCode?: string;
                playerId?: string;
                question?: Question;
                message?: string;
            }) => {
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
        socket.emit('room:start', { roomCode: roomState.roomCode }, (response: { ok: boolean; message?: string }) => {
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
                minutes,
            },
            (response: { ok: boolean; question?: Question; message?: string }) => {
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
        socket.emit(
            'room:reopen',
            { roomCode: roomState.roomCode },
            (response: { ok: boolean; question?: Question; message?: string }) => {
                if (!response.ok) {
                    setErrorMessage(response.message ?? 'ロビーに戻せませんでした。');
                    return;
                }
                if (response.question) {
                    setQuestion(response.question);
                }
                setStayInRoom(false);
            },
        );
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
                    errorCount: nextTotal - nextCorrect,
                },
            });
        },
        [correctCount, currentQuestionProgress, ensureSocket, roomState, totalCharProgress, totalInputCount],
    );

    const handleError = useCallback(() => {
        if (!roomState) return;
        const nextTotal = totalInputCount + 1;
        setTotalInputCount(nextTotal);
        const socket = ensureSocket();
        socket.emit('game:progress', {
            roomCode: roomState.roomCode,
            progress: {
                currentCharIndex: totalCharProgress,
                correctCount,
                totalInputCount: nextTotal,
                errorCount: nextTotal - correctCount,
            },
        });
    }, [correctCount, ensureSocket, roomState, totalCharProgress, totalInputCount]);

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
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                    <h2 className="text-2xl font-light">マルチプレイ</h2>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-1 grid grid-cols-2 gap-1">
                        <button
                            type="button"
                            onClick={() => setMenuView('create')}
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                                menuView === 'create'
                                    ? 'bg-white text-gray-900 border border-gray-200'
                                    : 'text-gray-500'
                            }`}
                        >
                            ルーム作成
                        </button>
                        <button
                            type="button"
                            onClick={() => setMenuView('join')}
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                                menuView === 'join' ? 'bg-white text-gray-900 border border-gray-200' : 'text-gray-500'
                            }`}
                        >
                            ルーム参加
                        </button>
                    </div>
                    {menuView === 'create' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="text-sm text-gray-500">プレイヤー名</div>
                                <input
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    placeholder="名前を入力"
                                    maxLength={16}
                                />
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="text-sm text-gray-500">難易度</div>
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                                        className="w-full rounded border border-gray-300 px-3 py-2"
                                    >
                                        {difficultyOptions.map((item) => (
                                            <option key={item.key} value={item.key}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-sm text-gray-500">制限時間（分）</div>
                                    <div className="rounded-xl border border-gray-200 px-4 py-3 bg-gray-50">
                                        <input
                                            type="range"
                                            min={1}
                                            max={5}
                                            step={1}
                                            value={minutes}
                                            onChange={(e) => setMinutes(Number(e.target.value))}
                                            className="w-full accent-gray-900"
                                            aria-label="制限時間"
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                            <span>1分</span>
                                            <span className="font-semibold text-gray-800">{minutes}分</span>
                                            <span>5分</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={createRoom}
                                    className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 text-white"
                                >
                                    作成してロビーへ
                                </Button>
                                <Button onClick={onBackToHome} variant="outline" className="rounded-xl">
                                    戻る
                                </Button>
                            </div>
                        </div>
                    )}

                    {menuView === 'join' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="text-sm text-gray-500">プレイヤー名</div>
                                <input
                                    value={playerName}
                                    onChange={(e) => setPlayerName(e.target.value)}
                                    className="w-full rounded border border-gray-300 px-3 py-2"
                                    placeholder="名前を入力"
                                    maxLength={16}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="text-sm text-gray-500">3桁ルームコード</div>
                                <div className="flex gap-2">
                                    <input
                                        value={roomCodeInput}
                                        onChange={(e) =>
                                            setRoomCodeInput(e.target.value.replace(/\D/g, '').slice(0, 3))
                                        }
                                        className="flex-1 rounded border border-gray-300 px-3 py-2 tracking-[0.3em]"
                                        placeholder="例: 123"
                                        inputMode="numeric"
                                        maxLength={3}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={joinRoom}
                                    className="w-full rounded-xl bg-gray-900 hover:bg-gray-800 text-white"
                                >
                                    入室
                                </Button>
                                <Button onClick={onBackToHome} variant="outline" className="rounded-xl">
                                    戻る
                                </Button>
                            </div>
                        </div>
                    )}
                    {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
                </div>
            </div>
        );
    }

    if (mode === 'lobby') {
        return (
            <div className="min-h-screen p-6">
                <div className="max-w-3xl mx-auto rounded-xl border border-gray-200 bg-white p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-light">ルーム待機中</h2>
                        <div className="text-sm text-gray-600">
                            ルームコード:
                            <span className="ml-2 font-semibold text-xl tracking-widest">{currentRoomCode}</span>
                        </div>
                    </div>

                    <div className="text-sm text-gray-600">
                        {isHost ? 'あなたはホストです。全員が揃ったらレース開始。' : 'ホストの開始を待っています。'}
                    </div>

                    <div className="space-y-2">
                        {ranking.map((player) => (
                            <div
                                key={player.playerId}
                                className="rounded border border-gray-200 px-3 py-2 flex justify-between"
                            >
                                <div>
                                    {player.name}
                                    {player.playerId === roomState?.hostPlayerId && (
                                        <span className="ml-2 text-xs text-gray-500">HOST</span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">{player.isCompleted ? '完了' : '待機中'}</div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                        <div className="text-sm text-gray-500">ロビー設定</div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-xs text-gray-500">難易度</div>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                                    className="w-full rounded border border-gray-300 px-3 py-2 disabled:bg-gray-100"
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
                                <div className="text-xs text-gray-500">制限時間（分）</div>
                                <div className="rounded-xl border border-gray-200 px-4 py-3 bg-white">
                                    <input
                                        type="range"
                                        min={1}
                                        max={5}
                                        step={1}
                                        value={minutes}
                                        onChange={(e) => setMinutes(Number(e.target.value))}
                                        className="w-full accent-gray-900 disabled:opacity-40"
                                        aria-label="制限時間"
                                        disabled={!isHost}
                                    />
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                        <span>1分</span>
                                        <span className="font-semibold text-gray-800">{minutes}分</span>
                                        <span>5分</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {isHost ? (
                            <Button onClick={updateLobbySettings} variant="outline" className="rounded-xl">
                                設定を反映
                            </Button>
                        ) : (
                            <div className="text-xs text-gray-500">設定変更はホストのみ可能です。</div>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {isHost && (
                            <Button onClick={startRace} className="rounded-xl bg-gray-900 hover:bg-gray-800 text-white">
                                レース開始
                            </Button>
                        )}
                        <Button onClick={onBackToHome} variant="outline" className="rounded-xl">
                            ホームへ
                        </Button>
                    </div>
                    {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
                </div>
            </div>
        );
    }

    if (mode === 'playing' && question) {
        return (
            <div className="min-h-screen bg-white p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-3xl font-light">マルチプレイレース</h2>
                            <div className="text-sm text-gray-500">
                                ルームコード:
                                <span className="ml-2 font-semibold text-xl tracking-widest">{currentRoomCode}</span>
                            </div>
                        </div>
                        <Button onClick={onBackToHome} variant="outline" className="rounded-xl">
                            退出
                        </Button>
                    </div>

                    <ProgressBar timeLimit={timeLimit} elapsedSeconds={elapsedTime} />

                    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
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

                        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                            <div className="text-sm text-gray-500">リアルタイム進捗</div>
                            {ranking.map((player, idx) => (
                                <div key={player.playerId} className="rounded border border-gray-200 p-3 space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span>
                                            {idx + 1}. {player.name}
                                        </span>
                                        <span className="text-gray-500">{player.isCompleted ? '完了' : '進行中'}</span>
                                    </div>
                                    <div className="h-2 rounded bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-full bg-gray-700 transition-all duration-200"
                                            style={{
                                                width: `${Math.min((player.currentCharIndex / progressMax) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        文字数: {player.currentCharIndex} / 正解率: {player.correctRate.toFixed(1)}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 space-y-4">
                <h2 className="text-2xl font-light">レース結果</h2>
                <div className="space-y-2">
                    <div className="text-sm text-gray-500">ランキング</div>
                </div>
                <div className="space-y-2">
                    {ranking.map((player, index) => (
                        <div
                            key={player.playerId}
                            className="rounded border border-gray-200 px-3 py-2 flex justify-between"
                        >
                            <div>
                                {index + 1}. {player.name}
                            </div>
                            <div className="text-sm text-gray-500">
                                文字数: {player.currentCharIndex} / 正解率: {player.correctRate.toFixed(1)}%
                            </div>
                        </div>
                    ))}
                </div>

                {myResult && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
                        <div className="text-sm text-gray-500">あなたの成績</div>
                        <div className="text-sm text-gray-700">入力数: {myResult.totalInputCount}</div>
                        <div className="text-sm text-gray-700">正解率: {myResult.correctRate.toFixed(1)}%</div>
                        <div className="text-sm text-gray-700">KPM: {myResult.kpm.toFixed(1)}</div>
                    </div>
                )}

                <div className="flex gap-3">
                    <Button onClick={onBackToHome} className="rounded-xl bg-gray-900 hover:bg-gray-800 text-white">
                        ホームに戻る
                    </Button>
                    <Button
                        onClick={() => {
                            setStayInRoom(true);
                            if (isHost) {
                                reopenLobby();
                            }
                        }}
                        variant="outline"
                        className="rounded-xl"
                    >
                        ロビーに残る
                    </Button>
                </div>
                {!isHost && stayInRoom && (
                    <div className="text-xs text-gray-500">ホストがロビーを開くまで待機します。</div>
                )}
            </div>
        </div>
    );
};
