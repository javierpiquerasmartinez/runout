import {
  GoogleIdTokenVerifier,
  type GoogleAccount,
  type GoogleVerifier,
} from './google-verifier.js';

/** What a dev sign-in token starts with; the web's "Test mode" sends `dev-sign-in|<persona>`. */
export const DEV_SIGN_IN_PREFIX = 'dev-sign-in';

/**
 * Local development only: lets a browser sign in as a fixed test persona
 * without Google, so pages behind an Account can be tried out. A token
 * `dev-sign-in|<persona>` is the Google account `dev-<persona>`, the same one
 * on every visit; any other token goes on to Google as usual.
 */
export class DevSignInVerifier implements GoogleVerifier {
  constructor(private readonly google: GoogleVerifier | null) {}

  verify(idToken: string): Promise<GoogleAccount | null> {
    const [prefix, persona, ...rest] = idToken.split('|');
    if (prefix !== DEV_SIGN_IN_PREFIX) {
      return this.google?.verify(idToken) ?? Promise.resolve(null);
    }
    if (!persona || rest.length > 0 || !/^[a-z0-9-]{1,32}$/.test(persona)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      subject: `dev-${persona}`,
      email: `${persona}@dev.runout.test`,
      persona: true,
    });
  }
}

/**
 * The verifier the environment asks for. `DEV_SIGN_IN=true` adds dev sign-in
 * on top of Google, and then Google's client ID becomes optional. It is
 * refused where `FRONTEND_URL` is set, which only production sets: a stray
 * `DEV_SIGN_IN` there stops the server instead of letting anyone in.
 */
export function googleVerifierFromEnv(env: NodeJS.ProcessEnv): GoogleVerifier {
  const clientId = env.GOOGLE_CLIENT_ID || undefined;
  if (env.DEV_SIGN_IN === 'true') {
    if (env.FRONTEND_URL) {
      throw new Error(
        'DEV_SIGN_IN is for local development only and must not be set alongside FRONTEND_URL.',
      );
    }
    return new DevSignInVerifier(
      clientId ? new GoogleIdTokenVerifier(clientId) : null,
    );
  }
  if (!clientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID is not set. See the README for how to get one for signing in with Google.',
    );
  }
  return new GoogleIdTokenVerifier(clientId);
}
