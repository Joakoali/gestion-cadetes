const REQUIRED_STRING_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'VAPID_SUBJECT',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
] as const;

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_STRING_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  return config;
}
