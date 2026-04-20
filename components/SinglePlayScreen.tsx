'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, Play } from 'lucide-react';
import { TypingDisplay } from '@/components/TypingDisplay';
import { ProgressBar } from '@/components/ProgressBar';
import { ResultCard } from '@/components/ResultCard';
import { ActionButton, ActionButtonRow } from '@/components/ui/action-button';
import { Progress } from '@/components/ui/progress';
import { useGameStore } from '@/store/gameStore';
import { Difficulty, DifficultyLeaderboardEntry, GameResult, Question } from '@/types/typing';
import { useCountdown } from '@/lib/use-countdown';
import questionsData from '@/data/questions.json';

const SINGLE_START_COUNTDOWN_SECONDS = 3;

const SURVIVAL_SETTINGS = {
    initialHp: 100,
    maxHp: 100,
    baseHpDrainPerSecond: 4,
    hpDrainGrowthPerPhase: 1,
    errorPenaltyHp: 2,
    timeoutPenaltyHp: 10,
    questionClearBonusHpByDifficulty: {
        easy: 8,
        medium: 16,
        hard: 20,
    },
    comboBonusEvery: 10,
    comboBonusHp: 10,
    minQuestionTimeSeconds: 10,
    maxQuestionTimeSeconds: 20,
} as const;

type QuestionDifficulty = Exclude<Difficulty, 'survival'>;

/**
 * シングルプレイ画面コンポーネント
 */
export const SinglePlayScreen: React.FC<{ onBackToHome?: () => void; onBackToDifficultySelect?: () => void }> = ({
    onBackToHome,
    onBackToDifficultySelect,
}) => {
    // ゲーム状態
    const { isPlaying, isPaused, difficulty, gameDurationMinutes, currentSession, startGame, endGame, resetGame } =
        useGameStore();
    const { data: session } = useSession();

    const [showResult, setShowResult] = useState(false);
    const [gameResult, setGameResult] = useState<GameResult | null>(null);
    const [leaderboard, setLeaderboard] = useState<DifficultyLeaderboardEntry[]>([]);
    const [isSavingPlayerName, setIsSavingPlayerName] = useState(false);
    const [isPlayerNameSaved, setIsPlayerNameSaved] = useState(false);
    const [savePlayerNameError, setSavePlayerNameError] = useState('');
    const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
    const [levelInfo, setLevelInfo] = useState<{
        previousLevel: number;
        currentLevel: number;
        leveledUp: boolean;
    } | null>(null);
    const [timeLimit, setTimeLimit] = useState(60);
    const [startCountdownTargetAt, setStartCountdownTargetAt] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [gameStartedAt, setGameStartedAt] = useState<number | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [correctCount, setCorrectCount] = useState(0);
    const [totalInputCount, setTotalInputCount] = useState(0);
    const [errorCount, setErrorCount] = useState(0);
    const [currentQuestionProgress, setCurrentQuestionProgress] = useState(0);
    const [completedQuestionCount, setCompletedQuestionCount] = useState(0);
    const [hp, setHp] = useState<number>(SURVIVAL_SETTINGS.initialHp);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [questionTimeLimit, setQuestionTimeLimit] = useState(15);
    const [questionElapsedSeconds, setQuestionElapsedSeconds] = useState(0);
    const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
    const [currentPhase, setCurrentPhase] = useState(1);
    const [maxPhaseReached, setMaxPhaseReached] = useState(1);
    const [phaseToastText, setPhaseToastText] = useState<string | null>(null);
    const [hpFloatingTexts, setHpFloatingTexts] = useState<Array<{ id: string; text: string; x: number; y: number }>>(
        [],
    );

    const comboRef = React.useRef(0);
    const hpRef = React.useRef<number>(SURVIVAL_SETTINGS.initialHp);
    const isFinishingRef = React.useRef(false);
    const lastHpDrainSecondRef = React.useRef(0);
    const lastQuestionElapsedRef = React.useRef(0);
    const currentPhaseRef = React.useRef(1);
    const phaseToastTimerRef = React.useRef<number | null>(null);

    const accentColor = 'emerald';
    const isSurvivalMode = difficulty === 'survival';
    const difficultyLabelMap: Record<Difficulty, string> = {
        easy: '初級',
        medium: '中級',
        hard: '上級',
        survival: '極限',
    };

    const questionDifficultyLabelMap: Record<QuestionDifficulty, string> = {
        easy: '初級',
        medium: '中級',
        hard: '上級',
    };

    const clampHp = useCallback((nextHp: number) => {
        return Math.max(0, Math.min(SURVIVAL_SETTINGS.maxHp, nextHp));
    }, []);

    const applyHpChange = useCallback(
        (delta: number, shouldShowFloating: boolean = false) => {
            setHp((prev) => {
                const next = clampHp(prev + delta);
                hpRef.current = next;
                if (shouldShowFloating && delta > 0) {
                    const id = `hp-${Date.now()}-${Math.random()}`;
                    setHpFloatingTexts([{ id, text: `+${Math.ceil(delta)}HP`, x: Math.random() * 100 - 50, y: 0 }]);
                    setTimeout(() => {
                        setHpFloatingTexts([]);
                    }, 1400);
                }
                return next;
            });
        },
        [clampHp],
    );

    const getPhaseByCompletedQuestions = useCallback((questionCount: number) => {
        return Math.floor(questionCount / 10) + 1;
    }, []);

    const showPhaseToast = useCallback((nextPhase: number) => {
        if (phaseToastTimerRef.current) {
            window.clearTimeout(phaseToastTimerRef.current);
        }
        setPhaseToastText(`Phase ${nextPhase}`);
        phaseToastTimerRef.current = window.setTimeout(() => {
            setPhaseToastText(null);
        }, 1400);
    }, []);

    const getHpDrainPerSecond = useCallback((phaseNumber: number) => {
        return SURVIVAL_SETTINGS.baseHpDrainPerSecond + (phaseNumber - 1) * SURVIVAL_SETTINGS.hpDrainGrowthPerPhase;
    }, []);

    const calculateQuestionTimeLimit = useCallback((question: Question) => {
        const romajiLength = Math.max(question.romaji?.length ?? 0, 4);
        const difficultyMultiplierMap: Record<QuestionDifficulty, number> = {
            easy: 1,
            medium: 1.15,
            hard: 1.35,
        };
        const questionDifficulty =
            question.difficulty === 'easy' || question.difficulty === 'medium' || question.difficulty === 'hard'
                ? question.difficulty
                : 'medium';
        const rawSeconds = Math.ceil(6 + romajiLength * 0.65 * difficultyMultiplierMap[questionDifficulty]);
        return Math.max(
            SURVIVAL_SETTINGS.minQuestionTimeSeconds,
            Math.min(SURVIVAL_SETTINGS.maxQuestionTimeSeconds, rawSeconds),
        );
    }, []);

    /**
     * ランダムな問題を取得
     */
    const getRandomQuestion = useCallback((diff: Difficulty): Question => {
        const questionMap = (questionsData as unknown as { questions: Record<string, Question[]> }).questions;
        const questionDifficulty: QuestionDifficulty =
            diff === 'survival' ? (['easy', 'medium', 'hard'] as const)[Math.floor(Math.random() * 3)] : diff;
        const questions = questionMap[questionDifficulty] || [];
        if (questions.length === 0) {
            return {
                id: 'default',
                difficulty: 'easy',
                japanese: 'テスト',
                romaji: 'tesuto',
            };
        }
        return questions[Math.floor(Math.random() * questions.length)];
    }, []);

    /**
     * ゲーム開始処理
     */
    const startSingleGameNow = useCallback(() => {
        setTimeLimit(gameDurationMinutes * 60);
        setElapsedTime(0);
        setStartCountdownTargetAt(null);
        const startedAt = Date.now();
        setGameStartedAt(startedAt);

        const question = getRandomQuestion(difficulty);
        setCurrentQuestion(question);
        setCorrectCount(0);
        setTotalInputCount(0);
        setErrorCount(0);
        setCurrentQuestionProgress(0);
        setCompletedQuestionCount(0);
        setHp(SURVIVAL_SETTINGS.initialHp);
        setCombo(0);
        setMaxCombo(0);
        setQuestionElapsedSeconds(0);
        setQuestionStartedAt(startedAt);
        setCurrentPhase(1);
        setMaxPhaseReached(1);
        setPhaseToastText(null);
        comboRef.current = 0;
        hpRef.current = SURVIVAL_SETTINGS.initialHp;
        isFinishingRef.current = false;
        lastHpDrainSecondRef.current = 0;
        lastQuestionElapsedRef.current = 0;
        currentPhaseRef.current = 1;
        if (phaseToastTimerRef.current) {
            window.clearTimeout(phaseToastTimerRef.current);
            phaseToastTimerRef.current = null;
        }

        if (difficulty === 'survival') {
            setQuestionTimeLimit(calculateQuestionTimeLimit(question));
        }

        setShowResult(false);

        startGame(difficulty, question);
    }, [calculateQuestionTimeLimit, difficulty, gameDurationMinutes, getRandomQuestion, startGame]);

    const startCountdownSecondsLeft = useCountdown({
        targetAt: startCountdownTargetAt,
        onComplete: () => {
            setStartCountdownTargetAt(null);
            startSingleGameNow();
        },
    });

    const handleStartGame = useCallback(() => {
        const targetAt = Date.now() + SINGLE_START_COUNTDOWN_SECONDS * 1000;
        setStartCountdownTargetAt(targetAt);
    }, []);

    const moveToNextQuestion = useCallback(
        (reason: 'completed' | 'timeout') => {
            if (!isPlaying) return;

            const clearedQuestionDifficulty: QuestionDifficulty =
                currentQuestion?.difficulty === 'easy' ||
                currentQuestion?.difficulty === 'medium' ||
                currentQuestion?.difficulty === 'hard'
                    ? currentQuestion.difficulty
                    : 'medium';

            const nextQuestion = getRandomQuestion(difficulty);
            setCurrentQuestionProgress(0);
            setCurrentQuestion(nextQuestion);

            if (reason === 'completed') {
                setCompletedQuestionCount((prev) => {
                    const nextCount = prev + 1;
                    if (isSurvivalMode) {
                        const nextPhase = getPhaseByCompletedQuestions(nextCount);
                        if (nextPhase > currentPhaseRef.current) {
                            currentPhaseRef.current = nextPhase;
                            setCurrentPhase(nextPhase);
                            setMaxPhaseReached((prev) => Math.max(prev, nextPhase));
                            showPhaseToast(nextPhase);
                        }
                    }
                    return nextCount;
                });
            }

            if (!isSurvivalMode) return;

            if (reason === 'completed') {
                const bonus =
                    SURVIVAL_SETTINGS.questionClearBonusHpByDifficulty[clearedQuestionDifficulty] ||
                    SURVIVAL_SETTINGS.questionClearBonusHpByDifficulty.medium;
                applyHpChange(bonus, true);
            } else {
                comboRef.current = 0;
                setCombo(0);
                applyHpChange(-SURVIVAL_SETTINGS.timeoutPenaltyHp);
            }

            setQuestionTimeLimit(calculateQuestionTimeLimit(nextQuestion));
            setQuestionElapsedSeconds(0);
            setQuestionStartedAt(Date.now());
            lastQuestionElapsedRef.current = 0;
        },
        [
            applyHpChange,
            calculateQuestionTimeLimit,
            currentQuestion,
            difficulty,
            getRandomQuestion,
            isPlaying,
            isSurvivalMode,
            getPhaseByCompletedQuestions,
            showPhaseToast,
        ],
    );

    /**
     * タイピング完了処理（次の問題へ）
     */
    const handleTypingComplete = useCallback(() => {
        moveToNextQuestion('completed');
    }, [moveToNextQuestion]);

    const saveResultToDb = useCallback(
        async (result: GameResult, playerName: string) => {
            try {
                setIsSavingPlayerName(true);
                setIsLoadingLeaderboard(true);
                setSavePlayerNameError('');

                // ログイン状態の場合は userId を playerId として使用
                const finalResult = {
                    ...result,
                    playerName,
                    playerId: session?.user?.id || result.playerId,
                };

                const response = await fetch('/api/results', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ...finalResult,
                        mode: 'single',
                        startedAt: currentSession?.startedAt,
                        endedAt: Date.now(),
                    }),
                });

                if (!response.ok) {
                    throw new Error('保存に失敗しました。');
                }

                const payload = (await response.json()) as {
                    ok: boolean;
                    dbRank?: number;
                    leaderboard?: DifficultyLeaderboardEntry[];
                    levelInfo?: {
                        previousLevel: number;
                        currentLevel: number;
                        leveledUp: boolean;
                    };
                };

                if (!payload.ok) {
                    throw new Error('保存に失敗しました。');
                }

                setGameResult((prev) => (prev ? { ...prev, dbRank: payload.dbRank, playerName } : prev));
                setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
                if (payload.levelInfo) {
                    setLevelInfo(payload.levelInfo);
                }
                setIsPlayerNameSaved(true);
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('typic-player-name', playerName);
                }
            } catch (error) {
                console.error('[single] failed to save result', error);
                setSavePlayerNameError('保存に失敗しました。時間をおいて再試行してください。');
            } finally {
                setIsSavingPlayerName(false);
                setIsLoadingLeaderboard(false);
            }
        },
        [currentSession, session?.user?.id],
    );

    const handleSavePlayerName = useCallback(
        (playerName: string) => {
            if (!gameResult) return;
            void saveResultToDb(gameResult, playerName);
        },
        [gameResult, saveResultToDb],
    );

    const handleGameFinish = useCallback(() => {
        if (!currentQuestion) return;
        if (isFinishingRef.current) return;
        isFinishingRef.current = true;

        const totalTime = elapsedTime * 1000;
        const kpm = totalInputCount / (totalTime / 60000) || 0;
        const totalAttemptCount = totalInputCount + errorCount;

        // ログイン状態の場合はユーザー名を使用、未ログインならローカルストレージから取得
        let defaultPlayerName = 'Player';
        if (session?.user?.username) {
            defaultPlayerName = session.user.username;
        } else if (typeof window !== 'undefined') {
            defaultPlayerName = window.localStorage.getItem('typic-player-name') || 'Player';
        }

        const result: GameResult = {
            sessionId: currentSession?.sessionId || `session-${Date.now()}`,
            playerId: currentSession?.playerId || 'player',
            playerName: defaultPlayerName,
            difficulty,
            totalTime,
            correctCount,
            errorCount,
            totalInputCount,
            correctRate: totalAttemptCount > 0 ? (correctCount / totalAttemptCount) * 100 : 0,
            errorRate: totalAttemptCount > 0 ? (errorCount / totalAttemptCount) * 100 : 0,
            kpm,
            maxCombo,
            completedQuestionCount,
            survivalDurationSeconds: elapsedTime,
            reachedPhase: isSurvivalMode ? maxPhaseReached : undefined,
        };

        setGameResult(result);
        setLeaderboard([]);
        setIsPlayerNameSaved(false);
        setSavePlayerNameError('');
        setShowResult(true);
        endGame(result);

        // ログイン状態の場合は自動的に結果を保存
        if (session?.user?.username) {
            setTimeout(() => {
                void saveResultToDb(result, session.user!.username);
            }, 0);
        }
    }, [
        completedQuestionCount,
        correctCount,
        currentQuestion,
        currentSession,
        difficulty,
        elapsedTime,
        endGame,
        errorCount,
        isSurvivalMode,
        maxCombo,
        maxPhaseReached,
        totalInputCount,
        session?.user?.username,
    ]);

    /**
     * タイムアップ処理
     */
    const handleTimeUp = useCallback(() => {
        if (isPlaying) {
            handleGameFinish();
        }
    }, [isPlaying, handleGameFinish]);

    const handleQuestionTimeout = useCallback(() => {
        if (!isSurvivalMode || !isPlaying) return;
        moveToNextQuestion('timeout');
    }, [isPlaying, isSurvivalMode, moveToNextQuestion]);

    /**
     * 進捗更新
     */
    const handleProgress = useCallback(
        (state: { correctIndices: number[]; currentIndex: number }) => {
            const delta = state.currentIndex - currentQuestionProgress;
            if (delta <= 0) return;
            setCurrentQuestionProgress(state.currentIndex);
            setCorrectCount((prev) => prev + delta);
            setTotalInputCount((prev) => prev + delta);

            if (!isSurvivalMode) return;

            const previousCombo = comboRef.current;
            const nextCombo = previousCombo + delta;
            comboRef.current = nextCombo;
            setCombo(nextCombo);
            setMaxCombo((prev) => Math.max(prev, nextCombo));

            const previousComboStep = Math.floor(previousCombo / SURVIVAL_SETTINGS.comboBonusEvery);
            const nextComboStep = Math.floor(nextCombo / SURVIVAL_SETTINGS.comboBonusEvery);
            const reachedStepCount = nextComboStep - previousComboStep;
            if (reachedStepCount > 0) {
                applyHpChange(reachedStepCount * SURVIVAL_SETTINGS.comboBonusHp, true);
            }
        },
        [applyHpChange, currentQuestionProgress, isSurvivalMode],
    );

    const handleError = useCallback(() => {
        setErrorCount((prev) => prev + 1);
        if (!isSurvivalMode) return;
        comboRef.current = 0;
        setCombo(0);
        applyHpChange(-SURVIVAL_SETTINGS.errorPenaltyHp);
    }, [applyHpChange, isSurvivalMode]);

    /**
     * リスタート処理
     */
    const handleRestart = useCallback(() => {
        resetGame();
        handleStartGame();
    }, [resetGame, handleStartGame]);

    /**
     * メニューに戻る
     */
    const handleBackToMenu = useCallback(() => {
        resetGame();
        setShowResult(false);
        setGameResult(null);
        setLeaderboard([]);
        setIsPlayerNameSaved(false);
        setSavePlayerNameError('');
        setStartCountdownTargetAt(null);
        setCurrentQuestion(null);
        if (onBackToDifficultySelect) {
            onBackToDifficultySelect();
            return;
        }
        onBackToHome?.();
    }, [onBackToDifficultySelect, onBackToHome, resetGame]);

    /**
     * 経過時間更新
     */
    useEffect(() => {
        if (!isPlaying || isPaused || showResult || gameStartedAt === null) return;

        const interval = setInterval(() => {
            const now = Date.now();
            const rawElapsed = Math.floor((now - gameStartedAt) / 1000);
            const nextElapsed = isSurvivalMode ? rawElapsed : Math.min(rawElapsed, timeLimit);
            setElapsedTime(nextElapsed);

            if (isSurvivalMode) {
                const currentPhase = currentPhaseRef.current;
                for (let second = lastHpDrainSecondRef.current + 1; second <= nextElapsed; second += 1) {
                    applyHpChange(-getHpDrainPerSecond(currentPhase));
                }
                lastHpDrainSecondRef.current = Math.max(lastHpDrainSecondRef.current, nextElapsed);

                if (hpRef.current <= 0) {
                    clearInterval(interval);
                    setTimeout(() => {
                        handleGameFinish();
                    }, 0);
                    return;
                }

                if (questionStartedAt !== null) {
                    const nextQuestionElapsed = Math.floor((now - questionStartedAt) / 1000);
                    if (nextQuestionElapsed > lastQuestionElapsedRef.current) {
                        setQuestionElapsedSeconds(nextQuestionElapsed);
                        lastQuestionElapsedRef.current = nextQuestionElapsed;
                    }
                    if (nextQuestionElapsed >= questionTimeLimit) {
                        setTimeout(() => {
                            handleQuestionTimeout();
                        }, 0);
                    }
                }
                return;
            }

            if (nextElapsed >= timeLimit) {
                clearInterval(interval);
                setTimeout(() => {
                    handleTimeUp();
                }, 0);
            }
        }, 200);

        return () => clearInterval(interval);
    }, [
        applyHpChange,
        gameStartedAt,
        getHpDrainPerSecond,
        handleQuestionTimeout,
        handleTimeUp,
        handleGameFinish,
        isPaused,
        isPlaying,
        isSurvivalMode,
        questionStartedAt,
        questionTimeLimit,
        showResult,
        timeLimit,
    ]);

    useEffect(() => {
        return () => {
            if (phaseToastTimerRef.current) {
                window.clearTimeout(phaseToastTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;

            event.preventDefault();
            handleBackToMenu();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleBackToMenu]);

    if (showResult && gameResult) {
        return (
            <ResultCard
                result={gameResult}
                leaderboard={leaderboard}
                accentColor={accentColor}
                isSavingName={isSavingPlayerName}
                isSavedName={isPlayerNameSaved}
                saveErrorMessage={savePlayerNameError}
                isLoadingLeaderboard={isLoadingLeaderboard}
                levelInfo={levelInfo}
                onSavePlayerName={handleSavePlayerName}
                onRestart={handleRestart}
                onBackToMenu={handleBackToMenu}
            />
        );
    }

    if (!isPlaying || !currentQuestion) {
        return (
            <div className="w-full h-dvh flex flex-col items-center justify-center gap-4 px-4 py-3 animate-fade-up-soft">
                <div className="surface-card w-full max-w-md px-5 py-4 text-center space-y-1.5">
                    <div className="text-sm text-muted-foreground tracking-wide">ゲーム設定</div>
                    <div className="text-lg text-foreground">
                        難易度: <span className="font-semibold">{difficultyLabelMap[difficulty] ?? difficulty}</span>
                    </div>
                    <div className="text-lg text-foreground">
                        制限時間:{' '}
                        <span className="font-semibold">
                            {isSurvivalMode ? 'HPが0になるまで' : `${gameDurationMinutes}分`}
                        </span>
                    </div>
                    {isSurvivalMode && (
                        <div className="text-sm text-muted-foreground pt-2 space-y-1.5 border-t border-border/50">
                            <div className="text-xs font-semibold text-foreground pt-1.5">ゲームパラメータ</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-left">
                                    <div className="text-muted-foreground">最大HP</div>
                                    <div className="font-semibold text-foreground">{SURVIVAL_SETTINGS.maxHp}</div>
                                </div>
                                <div className="text-left">
                                    <div className="text-muted-foreground">基本HP減少/秒</div>
                                    <div className="font-semibold text-foreground">
                                        {SURVIVAL_SETTINGS.baseHpDrainPerSecond}
                                    </div>
                                </div>
                                <div className="text-left">
                                    <div className="text-muted-foreground">フェーズ間隔</div>
                                    <div className="font-semibold text-foreground">10問ごと</div>
                                </div>
                                <div className="text-left">
                                    <div className="text-muted-foreground">フェーズによるHP減少速度</div>
                                    <div className="font-semibold text-foreground">
                                        {SURVIVAL_SETTINGS.hpDrainGrowthPerPhase}/段
                                    </div>
                                </div>
                                <div className="text-left">
                                    <div className="text-muted-foreground">誤回答ペナルティ</div>
                                    <div className="font-semibold text-foreground">
                                        -{SURVIVAL_SETTINGS.errorPenaltyHp}
                                    </div>
                                </div>
                                <div className="text-left">
                                    <div className="text-muted-foreground">タイムアップペナルティ</div>
                                    <div className="font-semibold text-foreground">
                                        -{SURVIVAL_SETTINGS.timeoutPenaltyHp}
                                    </div>
                                </div>
                                <div className="text-left col-span-2">
                                    <div className="text-muted-foreground">問題クリア時HP回復</div>
                                    <div className="font-semibold text-foreground text-xs">
                                        初級: +{SURVIVAL_SETTINGS.questionClearBonusHpByDifficulty.easy} / 中級: +
                                        {SURVIVAL_SETTINGS.questionClearBonusHpByDifficulty.medium} / 上級: +
                                        {SURVIVAL_SETTINGS.questionClearBonusHpByDifficulty.hard}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {startCountdownSecondsLeft !== null && (
                        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">ゲーム開始まで</div>
                            <div className="text-3xl font-bold text-primary tabular-nums">
                                {startCountdownSecondsLeft}
                            </div>
                        </div>
                    )}
                </div>
                <ActionButtonRow className="w-full max-w-md">
                    <ActionButton
                        onClick={handleStartGame}
                        icon={Play}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                        disabled={startCountdownSecondsLeft !== null}
                    >
                        {startCountdownSecondsLeft !== null ? `開始まで ${startCountdownSecondsLeft}` : 'ゲーム開始'}
                    </ActionButton>
                    <ActionButton onClick={handleBackToMenu} variant="ghost" icon={ChevronLeft}>
                        戻る
                    </ActionButton>
                </ActionButtonRow>
            </div>
        );
    }

    return (
        <div className="w-full h-dvh flex flex-col overflow-hidden animate-fade-up-soft">
            {isSurvivalMode && phaseToastText && (
                <div className="pointer-events-none fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-sky-500/30 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm backdrop-blur-sm dark:text-sky-200">
                    {phaseToastText}
                </div>
            )}
            <div className="flex-shrink-0 p-3 md:p-4 border-b border-border/70">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl md:text-2xl font-light">タイピング練習</h1>
                        <div className="text-xs md:text-sm text-muted-foreground">
                            難易度: {difficultyLabelMap[difficulty] ?? difficulty} / 制限時間:{' '}
                            {isSurvivalMode ? 'HPが0になるまで' : `${gameDurationMinutes}分`}
                        </div>
                        {isSurvivalMode && (
                            <div className="text-xs md:text-sm text-muted-foreground">
                                現在問題:{' '}
                                {questionDifficultyLabelMap[currentQuestion.difficulty as QuestionDifficulty] ?? '中級'}{' '}
                                / フェーズ: {currentPhase}
                            </div>
                        )}
                    </div>
                    <ActionButton
                        onClick={handleBackToMenu}
                        variant="outline"
                        className="w-auto py-4"
                        size="sm"
                        icon={ChevronLeft}
                    >
                        戻る
                    </ActionButton>
                </div>
            </div>

            <div className="flex-shrink-0 p-2 md:p-3">
                <div className="max-w-3xl mx-auto">
                    {isSurvivalMode ? (
                        <div className="grid grid-cols-2 gap-3 items-center">
                            <div className="w-full space-y-2">
                                <div className="flex justify-between items-center min-h-5">
                                    <div className="text-sm font-medium text-muted-foreground">HP</div>
                                    {hpFloatingTexts.length > 0 && (
                                        <div className="flex flex-col items-end gap-0.5">
                                            {hpFloatingTexts.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="text-sm font-bold text-green-500 animate-bounce"
                                                >
                                                    {item.text}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Progress
                                    value={(hp / SURVIVAL_SETTINGS.maxHp) * 100}
                                    className={hp <= 25 ? 'bg-red-500/15' : ''}
                                />
                            </div>
                            <ProgressBar timeLimit={questionTimeLimit} elapsedSeconds={questionElapsedSeconds} />
                        </div>
                    ) : (
                        <ProgressBar timeLimit={timeLimit} elapsedSeconds={elapsedTime} />
                    )}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-4xl">
                    <TypingDisplay
                        key={`${currentQuestion.id}-${completedQuestionCount}`}
                        japanese={currentQuestion.japanese}
                        romaji={currentQuestion.romaji}
                        alternatives={currentQuestion.alternatives}
                        accentColor={`${accentColor}-500`}
                        difficulty={isSurvivalMode ? currentQuestion.difficulty : undefined}
                        onProgress={handleProgress}
                        onComplete={handleTypingComplete}
                        onError={handleError}
                    />
                </div>
            </div>

            <div className="flex-shrink-0 p-2 md:p-3 border-t border-border/70 sticky bottom-0 bg-background/95 backdrop-blur-sm z-10">
                <div className="max-w-3xl mx-auto">
                    <div className={`grid ${isSurvivalMode ? 'grid-cols-3' : 'grid-cols-3'} gap-3 text-center`}>
                        <div className="space-y-1">
                            <div className="text-xs md:text-sm text-muted-foreground">正タイプ数</div>
                            <div className="text-lg md:text-xl font-bold text-foreground">{totalInputCount}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs md:text-sm text-muted-foreground">誤タイプ数</div>
                            <div className="text-lg md:text-xl font-bold text-red-500">{errorCount}</div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-xs md:text-sm text-muted-foreground">正解率</div>
                            <div className={`text-lg md:text-xl font-bold text-${accentColor}-500`}>
                                {totalInputCount + errorCount > 0
                                    ? ((totalInputCount / (totalInputCount + errorCount)) * 100).toFixed(1)
                                    : 0}
                                %
                            </div>
                        </div>
                        {isSurvivalMode && (
                            <>
                                <div className="space-y-1">
                                    <div className="text-xs md:text-sm text-muted-foreground">コンボ</div>
                                    <div className="text-lg md:text-xl font-bold text-amber-500">{combo}</div>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs md:text-sm text-muted-foreground">問題正解</div>
                                    <div className="text-lg md:text-xl font-bold text-foreground">
                                        {completedQuestionCount}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
