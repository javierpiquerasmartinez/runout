import { Global, Module } from '@nestjs/common';
import { FILE_STORE, type FileStore } from './file-store.js';
import { R2FileStore } from './r2-file-store.js';

/**
 * The file store the environment asks for: R2 with its four settings. When
 * `required`, it refuses to start without them; otherwise, without them there
 * is none, and Bulk Imports are refused.
 */
export function fileStoreFromEnv(
  env: NodeJS.ProcessEnv,
  required: boolean,
): FileStore | null {
  const accountId = env.R2_ACCOUNT_ID || undefined;
  const accessKeyId = env.R2_ACCESS_KEY_ID || undefined;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY || undefined;
  const bucket = env.R2_BUCKET || undefined;
  if (accountId && accessKeyId && secretAccessKey && bucket) {
    return new R2FileStore({ accountId, accessKeyId, secretAccessKey, bucket });
  }
  if (required) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set to keep Bulk Imports’ files. See the README.',
    );
  }
  return null;
}

/**
 * The API's file store: required in production, the only place
 * `FRONTEND_URL` is set.
 */
@Global()
@Module({
  providers: [
    {
      provide: FILE_STORE,
      useFactory: () =>
        fileStoreFromEnv(process.env, Boolean(process.env.FRONTEND_URL)),
    },
  ],
  exports: [FILE_STORE],
})
export class FileStoreModule {}
