// Test environment: never use a real key or real network. Adapter tests route the fixed endpoint to local stubs.
process.env.TYPESAFE_API_KEY = "test-key-not-real-0123456789";
process.env.JEV_MODEL = "jev-1.13.0";
process.env.DATABASE_PATH = ":memory:";
process.env.ALLOW_MOCK_MODE = "true";
process.env.JEV_TIMEOUT_MS = "1000";
process.env.APP_ORIGIN = "http://localhost:3000";
