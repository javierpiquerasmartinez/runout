import { OAuth2Client } from 'google-auth-library';

/** Who Google says signed in. */
export interface GoogleAccount {
  /** Google's stable id for the person; never reused, never changes. */
  subject: string;
  email: string | null;
}

/**
 * Where the server checks a Google ID token. Injectable, like the clock, so
 * tests sign in without Google.
 */
export interface GoogleVerifier {
  /** The account the token was issued for, or null if it isn't a valid one for this app. */
  verify(idToken: string): Promise<GoogleAccount | null>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

/** Checks ID tokens against Google's keys and this app's client ID. */
export class GoogleIdTokenVerifier implements GoogleVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verify(idToken: string): Promise<GoogleAccount | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) return null;
      return {
        subject: payload.sub,
        email: payload.email_verified ? (payload.email ?? null) : null,
      };
    } catch {
      // Expired, forged, or meant for another app.
      return null;
    }
  }
}
