'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InputState } from '@/types/typing';
import { romajiEngine } from '@/utils/romajiEngine';

interface TypingDisplayProps {
    japanese: string;
    accentColor?: string;
    onProgress?: (state: InputState) => void;
    onComplete?: () => void;
    onError?: (position: number) => void;
}

export const TypingDisplay: React.FC<TypingDisplayProps> = ({
    japanese,
    accentColor = 'emerald',
    onProgress,
    onComplete,
    onError,
}) => {
    const [userInput, setUserInput] = useState<string>('');
    const [japaneseIndex, setJapaneseIndex] = useState<number>(0);
    const [correctIndices, setCorrectIndices] = useState<Set<number>>(new Set());
    const [typedHistory, setTypedHistory] = useState<Array<{ char: string; correct: boolean }>>([]);
    const [lastError, setLastError] = useState<boolean>(false);

    const inputRef = useRef<HTMLInputElement>(null);

    const accentColorMap: Record<string, string> = {
        emerald: '#10b981',
        blue: '#3b82f6',
        green: '#22c55e',
        purple: '#a855f7',
        red: '#ef4444',
    };

    const accentColorHex = accentColorMap[accentColor] || '#10b981';

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
                const tempInput = newInput;
                const inputChar = newInput[newInput.length - 1] ?? '';
                const checkResult = romajiEngine.checkInput(japanese, japaneseIndex, tempInput);

                if (checkResult.isCorrect) {
                    setTypedHistory((prev) => [...prev, { char: inputChar, correct: true }]);
                    setCorrectIndices((prev) => {
                        const newSet = new Set(prev);
                        newSet.add(japaneseIndex);

                        if (onProgress) {
                            onProgress({
                                currentIndex: checkResult.nextIndex,
                                correctIndices: Array.from(newSet),
                                displayText: japanese.substring(0, checkResult.nextIndex),
                                nextCharToType: romajiEngine.getNextCharHint(japanese, checkResult.nextIndex),
                                lastError: false,
                            });
                        }

                        return newSet;
                    });

                    const newCurrentIndex = checkResult.nextIndex;
                    setJapaneseIndex(newCurrentIndex);
                    setLastError(false);
                    setUserInput('');

                    if (newCurrentIndex >= japanese.length) {
                        if (onComplete) {
                            onComplete();
                        }
                    }
                } else {
                    setTypedHistory((prev) => [...prev, { char: inputChar, correct: false }]);
                    setLastError(true);
                    onError?.(japaneseIndex);
                    setUserInput('');
                }
            }
        },
        [japanese, japaneseIndex, userInput, onProgress, onComplete, onError],
    );

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // クリック時に input に focus
    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    const romajiTarget = romajiEngine.toRomaji(japanese);
    const completedRomaji = romajiEngine.toRomaji(japanese.substring(0, japaneseIndex));

    const displayChars = japanese.split('').map((char: string, index: number) => {
        const isCorrect = correctIndices.has(index);
        const isCurrent = index === japaneseIndex;

        return {
            char,
            index,
            isCorrect,
            isCurrent,
        };
    });

    return (
        <div
            className="w-full max-w-2xl mx-auto px-4 py-8 focus-within:outline-none cursor-text"
            onClick={handleContainerClick}
        >
            <div className="text-center mb-12">
                <div className="text-4xl md:text-5xl font-light leading-relaxed tracking-wide h-24 flex items-center justify-center">
                    {displayChars.map(({ char, index, isCorrect, isCurrent }) => (
                        <span
                            key={index}
                            className={`inline-block transition-all duration-200 px-1 rounded ${
                                isCorrect ? 'bg-emerald-50 text-gray-900' : 'text-gray-900'
                            } ${isCurrent && !isCorrect ? 'font-semibold underline underline-offset-8' : ''}`}
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

            <div className="text-center mb-8 min-h-12 flex flex-col items-center justify-center space-y-3">
                <div className="text-sm text-gray-500 uppercase tracking-[0.25em]">ローマ字全文</div>
                <div className="text-2xl font-mono tracking-widest text-gray-700 break-words">
                    {romajiTarget.split('').map((char: string, idx: number) => {
                        const isCompleted = idx < completedRomaji.length;
                        const isCurrent = idx === completedRomaji.length;

                        return (
                            <span
                                key={idx}
                                className={`inline-block mr-1 transition-colors duration-200 px-0.5 rounded ${
                                    isCompleted ? 'bg-emerald-50 text-gray-900' : 'text-gray-800'
                                } ${isCurrent ? 'font-semibold underline underline-offset-4' : ''}
                                }`}
                                style={{ color: isCurrent ? accentColorHex : undefined }}
                            >
                                {char}
                            </span>
                        );
                    })}
                </div>
            </div>

            <div className="text-center mb-8 min-h-10">
                <div className={`text-lg font-mono tracking-wider ${lastError ? 'text-red-500' : 'text-gray-500'}`}>
                    {typedHistory.length > 0 ? (
                        typedHistory.slice(-20).map((item, idx: number) => (
                            <span
                                key={`${item.char}-${idx}`}
                                className={`inline-block mr-1 px-2 py-1 rounded border ${
                                    item.correct
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-red-50 text-red-600 border-red-200'
                                }`}
                            >
                                {item.char}
                            </span>
                        ))
                    ) : userInput ? (
                        userInput.split('').map((char: string, idx: number) => (
                            <span key={idx} className="inline-block mr-1 px-1 py-0.5 rounded bg-gray-100 text-black">
                                {char}
                            </span>
                        ))
                    ) : (
                        <span className="inline-block opacity-0">_</span>
                    )}
                </div>
            </div>

            <div className="text-center mb-6">
                <div className="text-sm text-gray-500 tabular-nums">
                    {japaneseIndex} / {japanese.length}
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                    <div
                        className="h-full transition-all duration-300"
                        style={{
                            width: `${(japaneseIndex / japanese.length) * 100}%`,
                            backgroundColor: accentColor,
                        }}
                    />
                </div>
            </div>

            <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={handleInputChange}
                className="absolute inset-0 opacity-0"
                autoFocus
                autoComplete="off"
                spellCheck="false"
            />

            {japaneseIndex >= japanese.length && (
                <div className="text-center mt-12">
                    <div className="text-2xl font-light" style={{ color: accentColor }}>
                        完了！
                    </div>
                </div>
            )}

            {lastError && (
                <div className="fixed bottom-4 left-4 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded animate-pulse">
                    誤字。もう一度入力してください。
                </div>
            )}
        </div>
    );
};
