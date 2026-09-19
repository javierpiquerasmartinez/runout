import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DATABASE, DATABASE_URL, type Database } from './database.js';
import * as schema from './schema.js';

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_URL,
      useFactory: (): string => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error(
            'DATABASE_URL is not set. See the README for how to point the server at Postgres.',
          );
        }
        return url;
      },
    },
    {
      provide: DATABASE,
      inject: [DATABASE_URL],
      useFactory: (url: string): Database =>
        drizzle({
          client: new pg.Pool({
            connectionString: url,
            // Fail a request fast instead of hanging when Postgres is down.
            connectionTimeoutMillis: 5_000,
          }),
          schema,
        }),
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
