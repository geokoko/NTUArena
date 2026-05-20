// Set defaults for env vars that src/app.js requires at boot. Tests don't
// need real values; they just need the app module to load without throwing.
// Existing values from the shell or CI take precedence via ??=.
process.env.NODE_ENV ??= 'test';
process.env.APP_MODE ??= 'dev';
process.env.CORS_ORIGIN ??= '*';
process.env.JWT_SECRET ??= 'test-secret';
