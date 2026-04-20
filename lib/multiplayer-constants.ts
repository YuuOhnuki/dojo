/**
 * Multiplayer UI constants - difficulty options, score labels, etc.
 */

import { ScoreMode } from '@/types/multiplayer';
import { Difficulty} from '@/types/typing';

export const SOCKET_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:4001';
export const HEALTH_CHECK_URL = `${SOCKET_URL}/health`;
export const DEFAULT_PLAYER_NAME = 'Player';
export const DEFAULT_HOST_NAME = 'Host';

export const difficultyOptions: { key: Difficulty; label: string }[] = [
    { key: 'easy', label: '初級' },
    { key: 'medium', label: '中級' },
    { key: 'hard', label: '上級' },
];

export const scoreModeLabels: Record<ScoreMode, string> = {
    'correct-count': '正解タイプ数',
    'correct-rate': '正解率',
    'completed-questions': '正解問題数',
    kpm: 'KPM',
};
