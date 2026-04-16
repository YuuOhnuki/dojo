import { createClient, type Client } from '@libsql/client';
import { CREATE_DB_SCHEMA_SQL } from '@/lib/db/schema';

let client: Client | null = null;
let schemaEnsured = false;

const resolveDbConfig = () => {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
        throw new Error('TURSO_DATABASE_URL is not configured.');
    }

    // Turso local db can run without token, production usually requires it.
    if (url.startsWith('libsql://') && !authToken) {
        throw new Error('TURSO_AUTH_TOKEN is required for libsql:// URLs.');
    }

    return {
        url,
        authToken,
    };
};

export const getDbClient = (): Client => {
    if (client) return client;
    const config = resolveDbConfig();
    client = createClient(config);
    return client;
};

export const ensureDbSchema = async (): Promise<void> => {
    if (schemaEnsured) return;

    const db = getDbClient();
    for (const statement of CREATE_DB_SCHEMA_SQL) {
        await db.execute(statement);
    }

    schemaEnsured = true;
};
