'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    CheckCircle2,
    Crown,
    DoorOpen,
    Flag,
    Globe2,
    Home,
    Lock,
    LogIn,
    MessageSquare,
    Plus,
    RefreshCw,
    Send,
    ShieldX,
    Swords,
    X,
    Users,
} from 'lucide-react';
import { TypingDisplay } from '@/components/TypingDisplay';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Difficulty, Question } from '@/types/typing';
import {
    GameCountdownPayload,
    GameStartedPayload,
    MultiplayerRoomState,
    PublicRoomSummary,
    ScoreMode,
    TeamMode,
} from '@/types/multiplayer';
import questionsData from '@/data/questions.json';

const SOCKET_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';
const HEALTH_CHECK_URL = `${SOCKET_URL}/health`;
const DEFAULT_PLAYER_NAME = 'Player';
const DEFAULT_HOST_NAME = 'Host';
const MINUTES_MIN = 1;
const MINUTES_MAX = 5;
const ROOM_CODE_LENGTH = 3;
const MAX_PLAYERS_MIN = 2;
const MAX_PLAYERS_MAX = 20;

const difficultyOptions: { key: Difficulty; label: string }[] = [
    { key: 'easy', label: '初級' },
    { key: 'medium', label: '中級' },
    { key: 'hard', label: '上級' },
];

type Mode = 'menu' | 'lobby' | 'playing' | 'finished';
type MenuView = 'create' | 'join';
type JoinView = 'public' | 'private';

interface RoomActionAck {
    ok: boolean;
    message?: string;
}

interface JoinCreateAck extends RoomActionAck {
    roomCode?: string;
    playerId?: string;
    question?: Question;
    roomName?: string;
}

interface UpdateSettingsAck extends RoomActionAck {
    question?: Question;
}

interface PublicRoomsAck extends RoomActionAck {
    rooms?: PublicRoomSummary[];
}

interface ChatMessageAck extends RoomActionAck {
    message?: string;
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
const clampMaxPlayers = (value: number): number => Math.max(MAX_PLAYERS_MIN, Math.min(MAX_PLAYERS_MAX, Math.round(value)));

const scoreModeLabels: Record<ScoreMode, string> = {
    'correct-count': '正解タイプ数',
    'correct-rate': '正解率',
    'completed-questions': '正解問題数',
    kpm: 'KPM',
};

const getTeamNameClass = (mode: TeamMode, teamId: 'A' | 'B' | null | undefined): string => {
    if (mode !== 'two-teams') return 'text-foreground';
    if (teamId === 'A') return 'text-cyan-600 dark:text-cyan-300';
    if (teamId === 'B') return 'text-rose-600 dark:text-rose-300';
    return 'text-muted-foreground';
};

const getTeamBadgeClass = (mode: TeamMode, teamId: 'A' | 'B' | null | undefined): string => {
    if (mode !== 'two-teams') return 'bg-muted text-muted-foreground';
    if (teamId === 'A') return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300';
    if (teamId === 'B') return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    return 'bg-muted text-muted-foreground';
};

const isTypingElement = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
    );
};

export const MultiPlayScreen: React.FC<{ onBackToHome?: () => void }> = ({ onBackToHome }) => {
    const socketRef = useRef<Socket | null>(null);
    const [mode, setMode] = useState<Mode>('menu');
    const [menuView, setMenuView] = useState<MenuView>('create');
    const [joinView, setJoinView] = useState<JoinView>('public');
    const [playerName, setPlayerName] = useState('Player');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [minutes, setMinutes] = useState(1);
    const [maxPlayers, setMaxPlayers] = useState(6);
    const [isPublicRoom, setIsPublicRoom] = useState(true);
    const [autoStart, setAutoStart] = useState(false);
    const [teamMode, setTeamMode] = useState<TeamMode>('free');
    const [scoreMode, setScoreMode] = useState<ScoreMode>('correct-count');
    const [roomState, setRoomState] = useState<MultiplayerRoomState | null>(null);
    const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
    const [selectedPublicRoomCode, setSelectedPublicRoomCode] = useState('');
    const [isLoadingPublicRooms, setIsLoadingPublicRooms] = useState(false);
    const [question, setQuestion] = useState<Question | null>(null);
    const [playerId, setPlayerId] = useState<string>('');
    const [timeLimit, setTimeLimit] = useState(60);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
    const [countdownTargetAt, setCountdownTargetAt] = useState<number | null>(null);
    const [countdownSecondsLeft, setCountdownSecondsLeft] = useState<number | null>(null);
    const [correctCount, setCorrectCount] = useState(0);
    const [totalInputCount, setTotalInputCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [currentQuestionProgress, setCurrentQuestionProgress] = useState(0);
    const [totalCharProgress, setTotalCharProgress] = useState(0);
    const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [stayInRoom, setStayInRoom] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [isChatInputFocused, setIsChatInputFocused] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [lastReadChatMessageId, setLastReadChatMessageId] = useState<string | null>(null);
    const completionSentRef = useRef(false);
    const [serverOnline, setServerOnline] = useState<boolean | null>(null);
    const chatScrollRef = useRef<HTMLDivElement | null>(null);
    const isChatOpenRef = useRef(false);

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
        isChatOpenRef.current = isChatOpen;
    }, [isChatOpen]);

    useEffect(() => {
        const socket = ensureSocket();

        socket.on('room:state', (payload: MultiplayerRoomState) => {
            setRoomState(payload);
            const latestChatMessage = payload.chatMessages[payload.chatMessages.length - 1];
            if (latestChatMessage && (isChatOpenRef.current || !lastReadChatMessageId)) {
                setLastReadChatMessageId(latestChatMessage.id);
            }
            setDifficulty(payload.difficulty ?? 'easy');
            setMinutes(clampMinutes(payload.minutes ?? MINUTES_MIN));
            setMaxPlayers(clampMaxPlayers(payload.maxPlayers ?? 6));
            setIsPublicRoom(typeof payload.isPublic === 'boolean' ? payload.isPublic : true);
            setAutoStart(typeof payload.autoStart === 'boolean' ? payload.autoStart : false);
            setTeamMode(payload.teamMode === 'two-teams' ? 'two-teams' : 'free');
            setScoreMode(
                payload.scoreMode === 'correct-rate' ||
                payload.scoreMode === 'completed-questions' ||
                payload.scoreMode === 'kpm'
                    ? payload.scoreMode
                    : 'correct-count',
            );
            if (payload.status === 'waiting') setMode('lobby');
            if (payload.status === 'finished') {
                setMode('finished');
                setIsChatOpen(false);
            }
        });

        socket.on('room:kicked', () => {
            setRoomState(null);
            setMode('menu');
            setMenuView('join');
            setIsChatOpen(false);
            setLastReadChatMessageId(null);
            setCountdownTargetAt(null);
            setCountdownSecondsLeft(null);
            setErrorMessage('ホストによりルームから退出されました。');
        });

        socket.on('game:countdown', (payload: GameCountdownPayload) => {
            setCountdownTargetAt(payload.startsAt);
            setCountdownSecondsLeft(Math.max(payload.seconds, 1));
            setMode('lobby');
        });

        socket.on('game:started', (payload: GameStartedPayload) => {
            setCountdownTargetAt(null);
            setCountdownSecondsLeft(null);
            setQuestion(payload.question);
            setTimeLimit(payload.timeLimitSeconds);
            setElapsedTime(0);
            setGameStartedAt(Date.now());
            setCorrectCount(0);
            setTotalInputCount(0);
            setErrorCount(0);
            setCurrentQuestionProgress(0);
            setTotalCharProgress(0);
            setCompletedQuestionCount(0);
            completionSentRef.current = false;
            setIsChatOpen(false);
            setMode('playing');
        });

        socket.on('game:finished', () => {
            setIsChatOpen(false);
            setMode('finished');
        });

        return () => {
            socket.off('room:state');
            socket.off('game:countdown');
            socket.off('game:started');
            socket.off('game:finished');
            socket.off('room:kicked');
        };
    }, [ensureSocket, lastReadChatMessageId]);

    useEffect(() => {
        if (countdownTargetAt === null) return;

        const updateCountdown = () => {
            const remaining = Math.max(0, Math.ceil((countdownTargetAt - Date.now()) / 1000));
            setCountdownSecondsLeft(remaining);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 100);
        return () => clearInterval(interval);
    }, [countdownTargetAt]);

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
                completedQuestionCount,
            },
        });
        completionSentRef.current = true;
    }, [
        correctCount,
        elapsedTime,
        ensureSocket,
        errorCount,
        completedQuestionCount,
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

    useEffect(() => {
        if (mode !== 'lobby') return;
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [mode, roomState?.chatMessages]);

    const createRoom = useCallback(() => {
        setErrorMessage('');
        const socket = ensureSocket();
        const safePlayerName = normalizePlayerName(playerName, DEFAULT_HOST_NAME);
        socket.emit(
            'room:create',
            {
                playerName: safePlayerName,
                isPublic: isPublicRoom,
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
    }, [ensureSocket, isPublicRoom, playerName]);

    const fetchPublicRooms = useCallback(() => {
        setIsLoadingPublicRooms(true);
        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit('room:list-public', {}, (response: PublicRoomsAck) => {
            setIsLoadingPublicRooms(false);
            if (!response.ok) {
                setErrorMessage(response.message ?? '公開ルームの取得に失敗しました。');
                return;
            }
            const nextRooms = response.rooms ?? [];
            setPublicRooms(nextRooms);
            if (selectedPublicRoomCode && !nextRooms.some((room) => room.roomCode === selectedPublicRoomCode)) {
                setSelectedPublicRoomCode('');
            }
        });
    }, [ensureSocket, selectedPublicRoomCode]);

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

    const joinPublicRoom = useCallback(
        (roomCode: string) => {
            setRoomCodeInput(roomCode);
            setErrorMessage('');
            const socket = ensureSocket();
            const safePlayerName = normalizePlayerName(playerName, DEFAULT_PLAYER_NAME);
            socket.emit(
                'room:join',
                {
                    roomCode,
                    playerName: safePlayerName,
                },
                (response: JoinCreateAck) => {
                    if (!response.ok) {
                        setErrorMessage(response.message ?? '入室に失敗しました。');
                        fetchPublicRooms();
                        return;
                    }
                    setPlayerId(response.playerId ?? '');
                    setQuestion(response.question ?? null);
                    setMode('lobby');
                },
            );
        },
        [ensureSocket, fetchPublicRooms, playerName],
    );

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
                maxPlayers: clampMaxPlayers(maxPlayers),
                isPublic: isPublicRoom,
                autoStart,
                teamMode,
                scoreMode,
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
    }, [autoStart, difficulty, ensureSocket, isPublicRoom, maxPlayers, minutes, roomState, scoreMode, teamMode]);

    const sendLobbyChat = useCallback(() => {
        if (!roomState || roomState.status !== 'waiting') return;
        const normalizedContent = chatInput.trim();
        if (!normalizedContent) return;

        setErrorMessage('');
        const socket = ensureSocket();
        socket.emit(
            'room:chat',
            {
                roomCode: roomState.roomCode,
                content: normalizedContent,
            },
            (response: ChatMessageAck) => {
                if (!response.ok) {
                    setErrorMessage(response.message ?? 'チャットの送信に失敗しました。');
                    return;
                }
                setChatInput('');
            },
        );
    }, [chatInput, ensureSocket, roomState]);

    const setReady = useCallback(
        (nextReady: boolean) => {
            if (!roomState) return;
            setErrorMessage('');
            const socket = ensureSocket();
            socket.emit(
                'room:set-ready',
                {
                    roomCode: roomState.roomCode,
                    isReady: nextReady,
                },
                (response: RoomActionAck) => {
                    if (!response.ok) {
                        setErrorMessage(response.message ?? '準備状態の更新に失敗しました。');
                    }
                },
            );
        },
        [ensureSocket, roomState],
    );

    const setPlayerTeam = useCallback(
        (targetPlayerId: string, nextTeam: 'A' | 'B') => {
            if (!roomState) return;
            setErrorMessage('');
            const socket = ensureSocket();
            socket.emit(
                'room:set-team',
                {
                    roomCode: roomState.roomCode,
                    targetPlayerId,
                    teamId: nextTeam,
                },
                (response: RoomActionAck) => {
                    if (!response.ok) {
                        setErrorMessage(response.message ?? 'チーム変更に失敗しました。');
                    }
                },
            );
        },
        [ensureSocket, roomState],
    );

    const transferHost = useCallback(
        (targetPlayerId: string) => {
            if (!roomState) return;
            setErrorMessage('');
            const socket = ensureSocket();
            socket.emit(
                'room:transfer-host',
                {
                    roomCode: roomState.roomCode,
                    targetPlayerId,
                },
                (response: RoomActionAck) => {
                    if (!response.ok) {
                        setErrorMessage(response.message ?? 'ホスト権限譲渡に失敗しました。');
                    }
                },
            );
        },
        [ensureSocket, roomState],
    );

    const kickPlayer = useCallback(
        (targetPlayerId: string) => {
            if (!roomState) return;
            setErrorMessage('');
            const socket = ensureSocket();
            socket.emit(
                'room:kick',
                {
                    roomCode: roomState.roomCode,
                    targetPlayerId,
                },
                (response: RoomActionAck) => {
                    if (!response.ok) {
                        setErrorMessage(response.message ?? 'キックに失敗しました。');
                    }
                },
            );
        },
        [ensureSocket, roomState],
    );

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
                    completedQuestionCount,
                },
            });
        },
        [
            correctCount,
            currentQuestionProgress,
            ensureSocket,
            errorCount,
            completedQuestionCount,
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
                completedQuestionCount,
            },
        });
    }, [completedQuestionCount, correctCount, ensureSocket, errorCount, roomState, totalCharProgress, totalInputCount]);

    const handleComplete = useCallback(() => {
        if (mode !== 'playing') return;
        const activeDifficulty = roomState?.difficulty ?? difficulty;
        const nextCompletedQuestionCount = completedQuestionCount + 1;
        setCompletedQuestionCount(nextCompletedQuestionCount);
        setCurrentQuestionProgress(0);
        setQuestion(getRandomQuestion(activeDifficulty));
        const socket = ensureSocket();
        socket.emit('game:progress', {
            roomCode: roomState?.roomCode,
            progress: {
                currentCharIndex: totalCharProgress,
                correctCount,
                totalInputCount,
                errorCount,
                completedQuestionCount: nextCompletedQuestionCount,
            },
        });
    }, [completedQuestionCount, correctCount, difficulty, ensureSocket, errorCount, getRandomQuestion, mode, roomState?.difficulty, roomState?.roomCode, totalCharProgress, totalInputCount]);

    const ranking = useMemo(() => {
        if (!roomState) return [];
        return [...roomState.players];
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

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();

                if (isChatOpen) {
                    setIsChatOpen(false);
                    return;
                }

                onBackToHome?.();
                return;
            }

            if (event.key !== 'Enter') return;

            const allowEnterFromPrivateCodeInput = mode === 'menu' && menuView === 'join' && joinView === 'private';
            if (isTypingElement(event.target) && !allowEnterFromPrivateCodeInput) return;

            if (mode !== 'menu' || isChatOpen) return;
            event.preventDefault();

            if (menuView === 'create') {
                createRoom();
                return;
            }

            if (joinView === 'private') {
                joinRoom();
                return;
            }

            if (selectedPublicRoomCode) {
                joinPublicRoom(selectedPublicRoomCode);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [
        createRoom,
        isChatOpen,
        joinPublicRoom,
        joinRoom,
        joinView,
        menuView,
        mode,
        onBackToHome,
        selectedPublicRoomCode,
    ]);

    if (mode === 'menu') {
        return (
            <div className="h-dvh flex items-center justify-center px-4 py-3 overflow-hidden">
                <div className="surface-card w-full max-w-3xl p-5 space-y-4 max-h-[95dvh] overflow-y-auto">
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
                            onClick={() => {
                                setMenuView('join');
                                setJoinView('public');
                                fetchPublicRooms();
                            }}
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

                            <div className="surface-muted p-3.5 space-y-3">
                                <div className="text-sm text-muted-foreground">ルーム作成設定</div>
                                <div className="grid gap-2 md:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant={isPublicRoom ? 'secondary' : 'outline'}
                                        className="justify-start"
                                        onClick={() => setIsPublicRoom(true)}
                                    >
                                        <Globe2 className="size-4" />
                                        公開ルーム
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={!isPublicRoom ? 'secondary' : 'outline'}
                                        className="justify-start"
                                        onClick={() => setIsPublicRoom(false)}
                                    >
                                        <Lock className="size-4" />
                                        非公開（コード招待）
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    ルーム名は作成時に自動生成されます。難易度や最大人数などの詳細設定はロビー内で行います。
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
                        <div className="space-y-3 max-h-[70dvh] overflow-y-auto pr-1">
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

                            <div className="surface-muted p-1 grid grid-cols-2 gap-1">
                                <Button
                                    type="button"
                                    variant={joinView === 'public' ? 'secondary' : 'ghost'}
                                    className="rounded-lg"
                                    onClick={() => {
                                        setJoinView('public');
                                        fetchPublicRooms();
                                    }}
                                >
                                    <Globe2 className="size-4" />
                                    公開ルーム
                                </Button>
                                <Button
                                    type="button"
                                    variant={joinView === 'private' ? 'secondary' : 'ghost'}
                                    className="rounded-lg"
                                    onClick={() => setJoinView('private')}
                                >
                                    <Lock className="size-4" />
                                    非公開ルーム
                                </Button>
                            </div>

                            {joinView === 'private' && (
                                <div className="space-y-2">
                                    <div className="text-sm text-muted-foreground">コードで参加（3桁）</div>
                                    <div className="flex justify-center md:justify-start">
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
                                    <Button type="button" onClick={joinRoom} className="w-full">
                                        <DoorOpen className="size-4" />
                                        コードで入室
                                    </Button>
                                </div>
                            )}

                            {joinView === 'public' && (
                                <div className="surface-muted p-3 rounded-lg space-y-2 min-h-56">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-muted-foreground">公開ルーム一覧</div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={fetchPublicRooms}
                                            disabled={isLoadingPublicRooms}
                                        >
                                            <RefreshCw className={`size-4 ${isLoadingPublicRooms ? 'animate-spin' : ''}`} />
                                            更新
                                        </Button>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto space-y-2">
                                        {publicRooms.length === 0 ? (
                                            <div className="text-xs text-muted-foreground">公開ルームはありません。</div>
                                        ) : (
                                            publicRooms.map((room) => (
                                                <button
                                                    key={room.roomCode}
                                                    type="button"
                                                    className={`w-full text-left rounded border px-3 py-2 transition-colors ${
                                                        selectedPublicRoomCode === room.roomCode
                                                            ? 'border-primary bg-primary/10'
                                                            : 'border-border hover:bg-muted/60'
                                                    }`}
                                                    onClick={() => {
                                                        setSelectedPublicRoomCode(room.roomCode);
                                                        setRoomCodeInput(room.roomCode);
                                                    }}
                                                >
                                                    <div className="font-medium">{room.roomName}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {room.hostName} / {room.difficulty} / {room.minutes}分 / {room.currentPlayers}人
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        className="w-full"
                                        disabled={!selectedPublicRoomCode}
                                        onClick={() => joinPublicRoom(selectedPublicRoomCode)}
                                    >
                                        <Users className="size-4" />
                                        選択ルームに参加
                                    </Button>
                                </div>
                            )}

                            <ActionButtonRow>
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
        const me = roomState?.players.find((player) => player.playerId === playerId);
        const chatMessages = roomState?.chatMessages ?? [];
        const unreadChatCount = (() => {
            if (chatMessages.length === 0 || !lastReadChatMessageId) return 0;
            const readIndex = chatMessages.findIndex((message) => message.id === lastReadChatMessageId);
            if (readIndex < 0) return chatMessages.length;
            return Math.max(chatMessages.length - readIndex - 1, 0);
        })();
        return (
            <div className="relative h-dvh p-3 md:p-4 overflow-hidden">
                <div className="surface-card max-w-3xl mx-auto h-full p-4 md:p-5 space-y-4 animate-fade-up-soft overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl md:text-2xl font-light">ルーム待機中</h2>
                            <div className="text-sm text-muted-foreground">{roomState?.roomName}</div>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                            <div>
                                ルームコード:
                                <span className="ml-2 font-semibold text-lg md:text-xl tracking-widest">{currentRoomCode}</span>
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1">
                                {roomState?.isPublic ? <Globe2 className="size-4" /> : <Lock className="size-4" />}
                                {roomState?.isPublic ? '公開' : '非公開'}
                            </div>
                        </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        {isHost
                            ? 'あなたはホストです。設定変更・チーム調整・キックが可能です。'
                            : 'ホストの開始を待っています。準備完了ボタンを押してください。'}
                    </div>

                    {countdownSecondsLeft !== null && (
                        <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                            ゲーム開始まで {countdownSecondsLeft}...
                        </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                        人数: {roomState?.players.length ?? 0}/{roomState?.maxPlayers ?? maxPlayers} | 自動スタート:{' '}
                        {roomState?.autoStart ? 'ON' : 'OFF'} | チーム: {roomState?.teamMode === 'two-teams' ? '2チーム' : '個人戦'} | 対戦方式:{' '}
                        {scoreModeLabels[scoreMode]}
                    </div>
                    {roomState?.teamMode === 'two-teams' && (
                        <div className="text-xs text-muted-foreground">チーム戦では各チームの平均値で判定します。</div>
                    )}

                    <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">参加者 ({ranking.length})</div>
                        <div className="max-h-56 md:max-h-64 overflow-y-auto space-y-2">
                            {ranking.map((player, idx) => (
                                <div
                                    key={player.playerId}
                                    className={`rounded border border-border px-3 py-2 flex items-center justify-between gap-2 ${
                                        player.playerId === playerId ? 'bg-blue-500/10 border-blue-500/40' : ''
                                    }`}
                                >
                                    <div className="flex min-w-0 items-center">
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
                                        <span className={`truncate font-medium ${getTeamNameClass(teamMode, player.teamId)}`}>
                                            {player.name}
                                        </span>
                                        {roomState?.teamMode === 'two-teams' && (
                                            <span
                                                className={`ml-2 text-[10px] rounded px-1.5 py-0.5 ${getTeamBadgeClass(teamMode, player.teamId)}`}
                                            >
                                                {player.teamId ?? '-'}
                                            </span>
                                        )}

                                        {player.playerId === playerId && (
                                            <span className="ml-2 text-xs text-blue-600 bg-blue-100 px-1 rounded">
                                                YOU
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <div className="text-xs text-muted-foreground">
                                            {player.playerId === roomState?.hostPlayerId
                                                ? 'ホスト'
                                                : player.isReady
                                                  ? '準備完了'
                                                  : '未準備'}
                                        </div>

                                        {isHost && player.playerId !== playerId && roomState?.teamMode === 'two-teams' && (
                                            <div className="inline-flex items-center rounded-md border border-border p-0.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={player.teamId === 'A' ? 'secondary' : 'ghost'}
                                                    className="h-7 px-2"
                                                    onClick={() => setPlayerTeam(player.playerId, 'A')}
                                                >
                                                    A
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={player.teamId === 'B' ? 'secondary' : 'ghost'}
                                                    className="h-7 px-2"
                                                    onClick={() => setPlayerTeam(player.playerId, 'B')}
                                                >
                                                    B
                                                </Button>
                                            </div>
                                        )}

                                        {isHost && player.playerId !== playerId && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => transferHost(player.playerId)}
                                            >
                                                <Crown className="size-4" />
                                                権限譲渡
                                            </Button>
                                        )}

                                        {isHost && player.playerId !== playerId && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="text-red-600 hover:text-red-700"
                                                onClick={() => kickPlayer(player.playerId)}
                                            >
                                                <ShieldX className="size-4" />
                                                キック
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {isHost ? (
                        <div className="surface-muted p-3.5 space-y-3">
                            <div className="text-sm text-muted-foreground">ロビー設定</div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">難易度</div>
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
                                    <div className="text-xs text-muted-foreground">チーム分け</div>
                                    <select
                                        value={teamMode}
                                        onChange={(e) => setTeamMode(e.target.value as TeamMode)}
                                        className="surface-input w-full px-3 py-2"
                                    >
                                        <option value="free">個人戦</option>
                                        <option value="two-teams">2チーム</option>
                                    </select>
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <div className="text-xs text-muted-foreground">対戦方式</div>
                                    <select
                                        value={scoreMode}
                                        onChange={(e) => setScoreMode(e.target.value as ScoreMode)}
                                        className="surface-input w-full px-3 py-2"
                                    >
                                        <option value="correct-count">正解タイプ数</option>
                                        <option value="correct-rate">正解率</option>
                                        <option value="completed-questions">正解問題数</option>
                                        <option value="kpm">KPM</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">人数</div>
                                    <div className="surface-muted px-3 py-2.5">
                                        <input
                                            type="range"
                                            min={MAX_PLAYERS_MIN}
                                            max={MAX_PLAYERS_MAX}
                                            step={1}
                                            value={maxPlayers}
                                            onChange={(e) => setMaxPlayers(clampMaxPlayers(Number(e.target.value)))}
                                            className="w-full accent-primary"
                                            aria-label="最大人数"
                                        />
                                        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{MAX_PLAYERS_MIN}人</span>
                                            <span className="font-semibold text-foreground">{maxPlayers}人</span>
                                            <span>{MAX_PLAYERS_MAX}人</span>
                                        </div>
                                    </div>
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

                                <div className="space-y-2 md:col-span-2">
                                    <div className="text-xs text-muted-foreground">公開設定</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant={isPublicRoom ? 'secondary' : 'outline'}
                                            onClick={() => setIsPublicRoom(true)}
                                        >
                                            <Globe2 className="size-4" />
                                            公開
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={!isPublicRoom ? 'secondary' : 'outline'}
                                            onClick={() => setIsPublicRoom(false)}
                                        >
                                            <Lock className="size-4" />
                                            非公開
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Button
                                        type="button"
                                        variant={autoStart ? 'secondary' : 'outline'}
                                        className="w-full justify-start"
                                        onClick={() => setAutoStart((prev) => !prev)}
                                    >
                                        <CheckCircle2 className="size-4" />
                                        自動スタート: {autoStart ? 'ON' : 'OFF'}
                                    </Button>
                                </div>
                            </div>
                            <ActionButton onClick={updateLobbySettings} variant="outline" icon={RefreshCw}>
                                設定を反映
                            </ActionButton>
                        </div>
                    ) : (
                        <div className="surface-muted p-3.5 space-y-2">
                            <div className="text-xs text-muted-foreground">開始前に準備完了を押してください。</div>
                            <Button
                                type="button"
                                variant={me?.isReady ? 'secondary' : 'default'}
                                className="w-full"
                                onClick={() => setReady(!(me?.isReady ?? false))}
                            >
                                <CheckCircle2 className="size-4" />
                                {me?.isReady ? '準備完了を解除' : '準備完了'}
                            </Button>
                        </div>
                    )}

                    <ActionButtonRow cols={isHost ? 2 : 1}>
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

                {isChatOpen ? (
                    <div
                        className="absolute inset-0 z-20"
                        onClick={() => setIsChatOpen(false)}
                        aria-hidden="true"
                    >
                        <div className="absolute left-3 bottom-3 w-[min(68vw,15rem)] md:left-4 md:bottom-4 md:w-[16rem] lg:w-[17rem]" onClick={(event) => event.stopPropagation()}>
                            <div className="surface-card overflow-hidden shadow-lg">
                                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                                    <div className="text-sm font-medium">ロビーのチャット</div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-xs text-muted-foreground">{chatMessages.length}件</div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => setIsChatOpen(false)}
                                            aria-label="チャットを閉じる"
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    </div>
                                </div>
                                <div ref={chatScrollRef} className="max-h-44 space-y-1 overflow-y-auto px-3 py-2 scrollbar-hide">
                                    {chatMessages.length === 0 ? (
                                        <div className="text-xs text-muted-foreground">まだメッセージはありません。</div>
                                    ) : (
                                        chatMessages.map((message) => (
                                            <div key={message.id} className="text-sm leading-relaxed break-words">
                                                <span className="font-semibold text-foreground">{message.playerName}</span>
                                                <span className="text-muted-foreground">: {message.content}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="border-t border-border/60 p-2">
                                    <form
                                        className="flex items-center gap-2"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            sendLobbyChat();
                                        }}
                                    >
                                        <input
                                            value={chatInput}
                                            onChange={(event) => setChatInput(event.target.value)}
                                            onFocus={() => setIsChatInputFocused(true)}
                                            onBlur={() => setIsChatInputFocused(false)}
                                            placeholder="メッセージを入力"
                                            className="surface-input min-w-0 flex-1 px-3 py-2 text-sm"
                                            maxLength={120}
                                        />
                                        <Button
                                            type="submit"
                                            size="sm"
                                            className={`h-9 shrink-0 px-0 ${isChatInputFocused ? 'w-16' : 'w-9'}`}
                                            aria-label="メッセージを送信"
                                        >
                                            {isChatInputFocused ? <span className="text-xs font-medium">送信</span> : <Send className="size-4" />}
                                        </Button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        onClick={() => {
                            setIsChatOpen(true);
                            const latestChatMessage = chatMessages[chatMessages.length - 1];
                            if (latestChatMessage) {
                                setLastReadChatMessageId(latestChatMessage.id);
                            }
                        }}
                        className="absolute left-3 bottom-3 z-20 h-11 w-11 rounded-full px-0 md:left-4 md:bottom-4"
                        aria-label="チャットを開く"
                    >
                        <MessageSquare className="size-5" />
                        {unreadChatCount > 0 && (
                            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                                {unreadChatCount > 99 ? '99+' : unreadChatCount}
                            </span>
                        )}
                    </Button>
                )}
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
                                                <span className={getTeamNameClass(teamMode, player.teamId)}>{player.name}</span>
                                                {roomState?.teamMode === 'two-teams' && (
                                                    <span
                                                        className={`ml-2 text-[10px] rounded px-1.5 py-0.5 ${getTeamBadgeClass(teamMode, player.teamId)}`}
                                                    >
                                                        {player.teamId ?? '-'}
                                                    </span>
                                                )}
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
            <div className="surface-card w-full max-w-xl p-5 space-y-3.5 max-h-[95dvh] overflow-y-auto">
                <h2 className="text-xl md:text-2xl font-light">レース結果</h2>
                <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">ランキング ({ranking.length})</div>
                    <div className="max-h-[45dvh] overflow-y-auto space-y-2 pr-1">
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
                                    <span className={getTeamNameClass(teamMode, player.teamId)}>{player.name}</span>
                                    {roomState?.teamMode === 'two-teams' && (
                                        <span
                                            className={`ml-2 text-[10px] rounded px-1.5 py-0.5 ${getTeamBadgeClass(teamMode, player.teamId)}`}
                                        >
                                            {player.teamId ?? '-'}
                                        </span>
                                    )}
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
                            <div>難易度別順位: {myResult.dbRank ? `${myResult.dbRank}位` : '計算中'}</div>
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
