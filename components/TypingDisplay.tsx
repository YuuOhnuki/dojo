'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { InputState } from '@/types/typing';
import { createTypingSoundPlayer } from '@/lib/typing-audio';
import { romajiEngine } from '@/utils/romajiEngine';

interface TypingDisplayProps {
    japanese: string;
    romaji?: string;
    alternatives?: string[];
    accentColor?: string;
    onProgress?: (state: InputState) => void;
    onComplete?: () => void;
    onError?: (position: number) => void;
}

export const TypingDisplay: React.FC<TypingDisplayProps> = ({
    japanese,
    romaji,
    alternatives,
    accentColor = 'emerald',
    onProgress,
    onComplete,
    onError,
}) => {
    const [userInput, setUserInput] = useState<string>('');
    const [typedRomaji, setTypedRomaji] = useState<string>('');
    const [japaneseProgress, setJapaneseProgress] = useState<number>(0);
    const [typedHistory, setTypedHistory] = useState<Array<{ char: string; correct: boolean }>>([]);
    const [lastError, setLastError] = useState<boolean>(false);
    const [isErrorToastVisible, setIsErrorToastVisible] = useState<boolean>(false);
    const [isErrorToastFading, setIsErrorToastFading] = useState<boolean>(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const soundPlayerRef = useRef(createTypingSoundPlayer());
    const errorToastFadeTimerRef = useRef<number | null>(null);
    const errorToastHideTimerRef = useRef<number | null>(null);

    const accentColorMap: Record<string, string> = {
        emerald: '#10b981',
        blue: '#3b82f6',
        green: '#22c55e',
        purple: '#a855f7',
        red: '#ef4444',
    };

    const accentColorHex = accentColorMap[accentColor] || '#10b981';

    const targetText = romaji && romaji.trim() ? romaji.trim() : romajiEngine.toRomaji(japanese);
    const hasExplicitRomaji = Boolean(romaji && romaji.trim());
    const romajiCandidates = useMemo(() => {
        const canonicalSources = [targetText, ...(alternatives ?? []).filter(Boolean)];
        const candidateSet = new Set<string>();
        for (const source of canonicalSources) {
            const normalized = source.trim();
            if (!normalized) continue;
            candidateSet.add(normalized);
            romajiEngine.getImeVariantsFromRomaji(normalized).forEach((variant) => candidateSet.add(variant));
        }
        return Array.from(candidateSet).sort((a, b) => a.length - b.length);
    }, [alternatives, targetText]);
    const pickCandidateForPrefix = useCallback(
        (prefix: string): string | null => {
            const matches = romajiCandidates.filter((candidate) => candidate.startsWith(prefix));
            if (matches.length === 0) return null;
            const exact = matches.find((candidate) => candidate === prefix);
            if (exact) return exact;
            return matches[0];
        },
        [romajiCandidates],
    );

    const triggerErrorToast = useCallback(() => {
        if (errorToastFadeTimerRef.current) {
            window.clearTimeout(errorToastFadeTimerRef.current);
        }
        if (errorToastHideTimerRef.current) {
            window.clearTimeout(errorToastHideTimerRef.current);
        }

        setIsErrorToastVisible(true);
        setIsErrorToastFading(false);

        errorToastFadeTimerRef.current = window.setTimeout(() => {
            setIsErrorToastFading(true);
        }, 900);

        errorToastHideTimerRef.current = window.setTimeout(() => {
            setIsErrorToastVisible(false);
            setIsErrorToastFading(false);
        }, 1300);
    }, []);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newInput = e.target.value;
            const previousLength = userInput.length;
            const newLength = newInput.length;

            if (newLength < previousLength) {
                setUserInput(newInput);
                return;
            }

            if (newLength === previousLength + 1) {
                const inputChar = newInput[newInput.length - 1] ?? '';
                const nextTyped = `${typedRomaji}${inputChar}`;
                const matchedCandidate = pickCandidateForPrefix(nextTyped);
                const hasPrefixMatch = matchedCandidate !== null;
                const hasExactMatch = matchedCandidate === nextTyped;

                if (hasPrefixMatch) {
                    soundPlayerRef.current.playKey();
                    setTypedHistory((prev) => [...prev, { char: inputChar, correct: true }]);
                    const activeCandidateLength = matchedCandidate?.length ?? targetText.length;
                    const nextJapaneseIndex = hasExplicitRomaji
                        ? Math.floor((nextTyped.length / Math.max(activeCandidateLength, 1)) * japanese.length)
                        : romajiEngine.analyzeFullInput(japanese, nextTyped).japaneseIndex;
                    const nextCorrectIndices: number[] = [];
                    for (let index = 0; index < nextJapaneseIndex; index += 1) {
                        nextCorrectIndices.push(index);
                    }
                    setJapaneseProgress(nextJapaneseIndex);
                    setTypedRomaji(nextTyped);
                    onProgress?.({
                        currentIndex: nextJapaneseIndex,
                        correctIndices: nextCorrectIndices,
                        displayText: nextTyped,
                        nextCharToType: matchedCandidate?.[nextTyped.length] ?? '',
                        lastError: false,
                    });
                    setLastError(false);
                    setUserInput('');

                    if (hasExactMatch) {
                        onComplete?.();
                    }
                } else {
                    soundPlayerRef.current.playError();
                    setTypedHistory((prev) => [...prev, { char: inputChar, correct: false }]);
                    setLastError(true);
                    triggerErrorToast();
                    onError?.(japaneseProgress);
                    setUserInput('');
                }
            }
        },
        [
            hasExplicitRomaji,
            japanese,
            japaneseProgress,
            onComplete,
            onError,
            onProgress,
            pickCandidateForPrefix,
            targetText.length,
            typedRomaji,
            triggerErrorToast,
            userInput,
        ],
    );

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        return () => {
            if (errorToastFadeTimerRef.current) {
                window.clearTimeout(errorToastFadeTimerRef.current);
            }
            if (errorToastHideTimerRef.current) {
                window.clearTimeout(errorToastHideTimerRef.current);
            }
        };
    }, []);

    // クリック時に input に focus
    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    const romajiTarget = pickCandidateForPrefix(typedRomaji) ?? targetText;
    const completedRomaji = typedRomaji;

    const displayChars = japanese.split('').map((char: string, index: number) => {
        const isCorrect = index < japaneseProgress;
        const isCurrent = index === japaneseProgress;

        return {
            char,
            index,
            isCorrect,
            isCurrent,
        };
    });

    return (
        <div
            className="w-full max-w-2xl mx-auto px-4 py-4 md:py-6 focus-within:outline-none cursor-text animate-fade-up-soft"
            onClick={handleContainerClick}
        >
            <div className="text-center mb-8">
                <div className="text-2xl md:text-3xl font-light leading-relaxed tracking-wide min-h-20 break-words whitespace-pre-wrap">
                    {displayChars.map(({ char, index, isCorrect, isCurrent }) => (
                        <span
                            key={index}
                            className={`inline-block transition-all duration-200 px-1 rounded ${
                                isCorrect ? 'bg-emerald-500/15 text-foreground' : 'text-foreground'
                            } ${isCurrent && !isCorrect ? 'font-semibold underline underline-offset-8 animate-soft-pop' : ''}`}
                            style={{
                                marginRight: '0.25em',
                                color: isCurrent && !isCorrect ? accentColorHex : undefined,
                            }}
                        >
                            {char}
                        </span>
                    ))}
                </div>
            </div>

            <div className="text-center mb-6 min-h-10 flex flex-col items-center justify-center space-y-2">
                <div className="text-sm text-muted-foreground uppercase tracking-[0.25em]">ローマ字全文</div>
                <div className="text-xl md:text-2xl font-mono tracking-wider text-foreground break-words">
                    {romajiTarget.split('').map((char: string, idx: number) => {
                        const isCompleted = idx < completedRomaji.length;
                        const isCurrent = idx === completedRomaji.length;

                        return (
                            <span
                                key={idx}
                                className={`inline-block mr-1 transition-colors duration-200 px-0.5 rounded ${
                                    isCompleted ? 'bg-emerald-500/15 text-foreground' : 'text-foreground/90'
                                } ${isCurrent ? 'font-semibold underline underline-offset-4' : ''}`}
                                style={{ color: isCurrent ? accentColorHex : undefined }}
                            >
                                {char}
                            </span>
                        );
                    })}
                </div>
            </div>

            <div className="text-center mb-6 min-h-9">
                <div className={`text-lg font-mono tracking-wider ${lastError ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {typedHistory.length > 0 ? (
                        typedHistory.slice(-20).map((item, idx: number) => (
                            <span
                                key={`${item.char}-${idx}`}
                                className={`inline-block mr-1 px-2 py-1 rounded border transition-transform duration-150 ${
                                    item.correct
                                        ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 backdrop-blur-sm dark:text-emerald-200'
                                        : 'border-red-500/35 bg-red-500/15 text-red-700 backdrop-blur-sm dark:text-red-200'
                                }`}
                            >
                                {item.char}
                            </span>
                        ))
                    ) : userInput ? (
                        userInput.split('').map((char: string, idx: number) => (
                            <span key={idx} className="inline-block mr-1 px-1 py-0.5 rounded bg-muted text-foreground">
                                {char}
                            </span>
                        ))
                    ) : (
                        <span className="inline-block opacity-0">_</span>
                    )}
                </div>
            </div>

            <div className="text-center mb-4">
                <div className="text-sm text-muted-foreground tabular-nums">
                    {typedRomaji.length} / {targetText.length}
                </div>
                <div className="mt-2 w-full bg-muted rounded-full h-1 overflow-hidden">
                    <div
                        className="h-full transition-all duration-300"
                        style={{
                            width: `${(typedRomaji.length / Math.max(romajiTarget.length, 1)) * 100}%`,
                            backgroundColor: accentColorHex,
                        }}
                    />
                </div>
            </div>

            <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={handleInputChange}
                className="absolute -left-[9999px] h-px w-px opacity-0 pointer-events-none"
                autoFocus
                autoComplete="off"
                spellCheck="false"
            />

            {typedRomaji.length >= romajiTarget.length && (
                <div className="text-center mt-12">
                    <div className="text-2xl font-light" style={{ color: accentColorHex }}>
                        完了！
                    </div>
                </div>
            )}

            {typeof document !== 'undefined' &&
                isErrorToastVisible &&
                createPortal(
                    <div
                        className={`pointer-events-none fixed bottom-4 left-4 z-[9999] rounded-xl border border-red-500/35 bg-red-500/15 px-4 py-2 text-red-700 shadow-sm backdrop-blur-md transition-opacity duration-300 dark:text-red-200 md:bottom-5 md:left-5 ${
                            isErrorToastFading ? 'opacity-0' : 'opacity-100'
                        }`}
                    >
                        誤字です。再度入力してください。
                    </div>,
                    document.body,
                )}
        </div>
    );
};
