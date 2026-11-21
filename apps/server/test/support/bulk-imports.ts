import pg from 'pg';

/** How an ended Bulk Import is recorded, for a test that only needs one to point at. */
export interface EndedBulkImport {
  status?: 'completed' | 'failed' | 'cancelled';
  fileName?: string;
  total?: number;
  processed?: number;
  imported?: number;
  reason?: string | null;
  failureCode?: string | null;
  /** When it was started, ISO; it ended a minute later. */
  createdAt?: string;
}

/**
 * Records an ended Bulk Import of this Account straight in the database, as
 * the import service would leave it, without uploading or importing any
 * file. For tests about what points at a Bulk Import, not about importing.
 */
export async function endedBulkImport(
  databaseUrl: string,
  identityId: string,
  fields: EndedBulkImport = {},
): Promise<string> {
  const createdAt = new Date(fields.createdAt ?? '2026-01-01T00:00:00.000Z');
  const client = new pg.Client(databaseUrl);
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `insert into bulk_imports
         (identity_id, status, files, total, processed, imported, reason,
          failure_code, created_at, finished_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        identityId,
        fields.status ?? 'failed',
        JSON.stringify([
          {
            name: fields.fileName ?? 'sesiones-2023.zip',
            size: 1024,
            key: `test/${crypto.randomUUID()}`,
            uploadId: 'done',
          },
        ]),
        fields.total ?? 210_000,
        fields.processed ?? 58_000,
        fields.imported ?? 58_000,
        fields.reason ?? null,
        fields.failureCode ?? null,
        createdAt,
        new Date(createdAt.getTime() + 60_000),
      ],
    );
    return rows[0].id;
  } finally {
    await client.end();
  }
}
