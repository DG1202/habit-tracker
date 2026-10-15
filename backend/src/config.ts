import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3300),
  APP_ORIGIN: z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      const url = new URL(value);
      return url.pathname === '/' && !url.search && !url.hash;
    })
    .transform((value) => new URL(value).origin),
  DATABASE_URL: z.string().startsWith('file:'),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid or missing environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

// Browsers send Origin "null" from sandboxed frames and some redirects, so it never matches.
export function isAllowedOrigin(origin: string | undefined, config: Config): boolean {
  return origin !== undefined && origin !== 'null' && origin === config.APP_ORIGIN;
}
