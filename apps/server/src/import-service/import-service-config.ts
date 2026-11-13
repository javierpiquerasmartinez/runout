/*
 * How the API and the import service find and trust each other. Both are
 * plain configuration, so that nothing here is tied to Render.
 */

/** The secret a wake must carry, in the import service. */
export const WAKE_SECRET = Symbol('WAKE_SECRET');

/** Where the API finds the import service, or null where there is none. */
export const IMPORT_SERVICE = Symbol('IMPORT_SERVICE');

export interface ImportServiceAddress {
  /** `host:port` on a private network: the service has no public address. */
  address: string;
  secret: string;
}

/** The import service refuses to start without its secret. */
export function wakeSecretFromEnv(env: NodeJS.ProcessEnv): string {
  const secret = env.IMPORT_SERVICE_SECRET || undefined;
  if (!secret) {
    throw new Error(
      'IMPORT_SERVICE_SECRET must be set: wakes without it are refused. See the README.',
    );
  }
  return secret;
}

/**
 * The API's view of the import service. Production, the only place
 * `FRONTEND_URL` is set, refuses to start without it; anywhere else it may be
 * left out, and nothing is woken.
 */
export function importServiceFromEnv(
  env: NodeJS.ProcessEnv,
): ImportServiceAddress | null {
  const address = env.IMPORT_SERVICE_ADDRESS || undefined;
  const secret = env.IMPORT_SERVICE_SECRET || undefined;
  if (address && secret) return { address, secret };
  if (env.FRONTEND_URL) {
    throw new Error(
      'IMPORT_SERVICE_ADDRESS and IMPORT_SERVICE_SECRET must be set to wake the import service. See the README.',
    );
  }
  return null;
}
