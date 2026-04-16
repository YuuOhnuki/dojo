import { NextRequest, NextResponse } from 'next/server';
import { Difficulty } from '@/types/typing';
import { getDifficultyLeaderboard, saveGameResult, type ResultMode, type SaveGameResultInput } from '@/lib/db/results-repository';

export const runtime = 'nodejs';

type SaveResultRequestBody = SaveGameResultInput;

const isDifficulty = (value: string): value is Difficulty => {
    return value === 'easy' || value === 'medium' || value === 'hard' || value === 'survival';
};

const isMode = (value: string): value is ResultMode => {
    return value === 'single' || value === 'multi';
};

export async function GET(request: NextRequest) {
    try {
        const difficultyQuery = request.nextUrl.searchParams.get('difficulty') ?? 'easy';
        const limitQuery = Number(request.nextUrl.searchParams.get('limit') ?? 10);

        if (!isDifficulty(difficultyQuery)) {
            return NextResponse.json({ ok: false, message: 'difficulty is invalid' }, { status: 400 });
        }

        const leaderboard = await getDifficultyLeaderboard(difficultyQuery, limitQuery);

        return NextResponse.json({
            ok: true,
            difficulty: difficultyQuery,
            leaderboard,
        });
    } catch (error) {
        console.error('[api/results][GET]', error);
        return NextResponse.json({ ok: false, message: 'failed to fetch leaderboard' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as SaveResultRequestBody;

        if (!body || !isDifficulty(body.difficulty) || !isMode(body.mode)) {
            return NextResponse.json({ ok: false, message: 'invalid payload' }, { status: 400 });
        }

        const saved = await saveGameResult(body);
        const leaderboard = await getDifficultyLeaderboard(body.difficulty, 10);

        return NextResponse.json({
            ok: true,
            dbRank: saved.dbRank,
            leaderboard,
        });
    } catch (error) {
        console.error('[api/results][POST]', error);
        return NextResponse.json({ ok: false, message: 'failed to save result' }, { status: 500 });
    }
}
