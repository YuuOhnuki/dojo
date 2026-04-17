'use client';

import { useEffect, useRef, useState } from 'react';

interface UseCountdownParams {
    targetAt: number | null;
    onComplete?: () => void;
    tickMs?: number;
}

/**
 * 指定時刻までの残り秒数を返す共通カウントダウンフック。
 */
export const useCountdown = ({ targetAt, onComplete, tickMs = 100 }: UseCountdownParams): number | null => {
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const completedTargetRef = useRef<number | null>(null);

    useEffect(() => {
        if (targetAt === null) {
            setSecondsLeft(null);
            completedTargetRef.current = null;
            return;
        }

        const updateCountdown = () => {
            const remaining = Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));
            setSecondsLeft(remaining);

            if (remaining <= 0 && completedTargetRef.current !== targetAt) {
                completedTargetRef.current = targetAt;
                onComplete?.();
            }
        };

        updateCountdown();
        const intervalId = window.setInterval(updateCountdown, tickMs);
        return () => window.clearInterval(intervalId);
    }, [onComplete, targetAt, tickMs]);

    return secondsLeft;
};
