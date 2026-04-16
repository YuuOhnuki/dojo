export const CREATE_DB_SCHEMA_SQL = [
    `
    CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('single', 'multi')),
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'survival')),
        started_at INTEGER,
        ended_at INTEGER,
        room_code TEXT,
        source TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('single', 'multi')),
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'survival')),
        total_time_ms INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        total_input_count INTEGER NOT NULL,
        correct_rate REAL NOT NULL,
        error_rate REAL NOT NULL,
        kpm REAL NOT NULL,
        max_combo INTEGER,
        completed_question_count INTEGER,
        survival_duration_seconds INTEGER,
        reached_phase INTEGER,
        multiplayer_rank INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (session_id) REFERENCES game_sessions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_results_difficulty_score
    ON game_results (difficulty, kpm DESC, correct_rate DESC, correct_count DESC, total_time_ms ASC)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_results_player
    ON game_results (player_id, created_at DESC)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_results_mode_difficulty
    ON game_results (mode, difficulty, created_at DESC)
    `,
];
