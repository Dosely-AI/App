/** Runtime configuration, read from the environment with dev-friendly defaults. */

export const config = {
  port: Number(process.env.PORT ?? 8787),

  /**
   * WebAuthn Relying Party ID — a registrable domain suffix of every origin.
   * "localhost" is special-cased by browsers as secure, so passkeys work over
   * http during development. In production this is your bare domain.
   */
  rpID: process.env.RP_ID ?? 'localhost',
  rpName: process.env.RP_NAME ?? 'DoselyAI',

  /** Origins allowed to call the API and complete a WebAuthn ceremony. */
  origins: (process.env.ORIGINS ?? 'http://localhost:8081,http://localhost:19006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-insecure-change-me',
  /** Session lifetime in seconds (default 30 days). */
  sessionTtlSec: 60 * 60 * 24 * 30,

  /**
   * Anthropic key for the hybrid chat's open-ended answers. Held ONLY here on
   * the server so app users never need their own. Empty = AI chat disabled
   * (the app still answers medication/data questions locally).
   */
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  chatModel: 'claude-opus-4-8',
} as const;

if (config.sessionSecret === 'dev-only-insecure-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET must be set to a strong random value in production.');
}
