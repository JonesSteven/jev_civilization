import "server-only";

/** Ordered, append-only schema migrations. */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        supported_tribe TEXT NOT NULL,
        seed TEXT NOT NULL,
        completed_turn INTEGER NOT NULL,
        version INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        rules_version TEXT NOT NULL,
        content_version TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        configured_model TEXT NOT NULL,
        state BLOB NOT NULL,
        initial_view BLOB NOT NULL,
        lease_token INTEGER NOT NULL DEFAULT 0,
        lease_holder TEXT,
        lease_expires_at INTEGER,
        attempts_used INTEGER NOT NULL DEFAULT 0,
        usage_input_tokens INTEGER NOT NULL DEFAULT 0,
        usage_output_tokens INTEGER NOT NULL DEFAULT 0,
        usage_unknown_attempts INTEGER NOT NULL DEFAULT 0,
        finished_at INTEGER,
        abandoned_at INTEGER
      );
      CREATE INDEX games_session_idx ON games(session_id, created_at);
      CREATE TABLE turn_intents (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id),
        turn INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        body_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        event_id TEXT NOT NULL,
        option_id TEXT NOT NULL,
        pre_state_hash TEXT NOT NULL,
        pre_version INTEGER NOT NULL,
        context BLOB NOT NULL,
        response BLOB,
        decisions BLOB,
        error_code TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(game_id, turn)
      );
      CREATE TABLE model_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        intent_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        attempt_no INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        latency_ms INTEGER,
        http_status INTEGER,
        outcome TEXT NOT NULL,
        error_code TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        response_id TEXT,
        model TEXT
      );
      CREATE INDEX model_attempts_intent_idx ON model_attempts(intent_id);
      CREATE TABLE turns (
        game_id TEXT NOT NULL REFERENCES games(id),
        turn INTEGER NOT NULL,
        intent_id TEXT NOT NULL,
        record BLOB NOT NULL,
        delta BLOB NOT NULL,
        post_state_hash TEXT NOT NULL,
        post_version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (game_id, turn)
      );
      CREATE TABLE keyframes (
        game_id TEXT NOT NULL REFERENCES games(id),
        turn INTEGER NOT NULL,
        state BLOB NOT NULL,
        PRIMARY KEY (game_id, turn)
      );
      CREATE TABLE rate_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX rate_events_idx ON rate_events(session_id, kind, at);
    `,
  },
];
