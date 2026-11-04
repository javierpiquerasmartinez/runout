import { describe, expect, it } from 'vitest';
import { DevSignInVerifier, googleVerifierFromEnv } from './dev-sign-in.js';
import {
  GoogleIdTokenVerifier,
  type GoogleVerifier,
} from './google-verifier.js';

const google: GoogleVerifier = {
  verify: (idToken) =>
    Promise.resolve(
      idToken === 'real' ? { subject: '1234', email: 'me@gmail.com' } : null,
    ),
};

describe('dev sign-in', () => {
  it('signs a persona in as the same fixed account every time', async () => {
    const verifier = new DevSignInVerifier(google);
    const account = {
      subject: 'dev-tester-a',
      email: 'tester-a@dev.runout.test',
    };
    expect(await verifier.verify('dev-sign-in|tester-a')).toEqual(account);
    expect(await verifier.verify('dev-sign-in|tester-a')).toEqual(account);
  });

  it('refuses a malformed persona', async () => {
    const verifier = new DevSignInVerifier(google);
    expect(await verifier.verify('dev-sign-in|')).toBeNull();
    expect(await verifier.verify('dev-sign-in|Tester A')).toBeNull();
    expect(await verifier.verify('dev-sign-in|a|b')).toBeNull();
  });

  it('passes any other token on to Google', async () => {
    expect(await new DevSignInVerifier(google).verify('real')).toEqual({
      subject: '1234',
      email: 'me@gmail.com',
    });
    expect(await new DevSignInVerifier(null).verify('real')).toBeNull();
  });
});

describe('the verifier the environment asks for', () => {
  it('is Google alone unless DEV_SIGN_IN is true', () => {
    expect(googleVerifierFromEnv({ GOOGLE_CLIENT_ID: 'id' })).toBeInstanceOf(
      GoogleIdTokenVerifier,
    );
    expect(
      googleVerifierFromEnv({ GOOGLE_CLIENT_ID: 'id', DEV_SIGN_IN: '1' }),
    ).toBeInstanceOf(GoogleIdTokenVerifier);
  });

  it('still needs Google’s client ID without dev sign-in', () => {
    expect(() => googleVerifierFromEnv({})).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('adds dev sign-in locally, with or without a client ID', () => {
    expect(googleVerifierFromEnv({ DEV_SIGN_IN: 'true' })).toBeInstanceOf(
      DevSignInVerifier,
    );
    expect(
      googleVerifierFromEnv({ DEV_SIGN_IN: 'true', GOOGLE_CLIENT_ID: 'id' }),
    ).toBeInstanceOf(DevSignInVerifier);
  });

  it('refuses to start with dev sign-in where FRONTEND_URL says production', () => {
    expect(() =>
      googleVerifierFromEnv({
        DEV_SIGN_IN: 'true',
        GOOGLE_CLIENT_ID: 'id',
        FRONTEND_URL: 'https://runout.vercel.app',
      }),
    ).toThrow(/DEV_SIGN_IN/);
  });
});
