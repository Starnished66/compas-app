import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

type SqlParams = SQLiteBindValue[];

interface SqlReader {
  query<T = any>(sql: string, params?: SqlParams): Promise<T[]>;
  queryFirst<T = any>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlConnection extends SqlReader {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<unknown>;
}

export interface SqlDatabase extends SqlReader {
  run(sql: string, params?: SqlParams): Promise<unknown>;
  transaction<T>(action: (tx: SqlConnection) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export class LocalCatalogUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Local catalog unavailable', { cause });
  }
}

export class LocalCatalogOpenError extends LocalCatalogUnavailableError {}
export class LocalCatalogReadError extends LocalCatalogUnavailableError {}
export class LocalCatalogWriteError extends LocalCatalogUnavailableError {}

async function catalogSql<T>(operation: () => Promise<T>, ErrorType: typeof LocalCatalogUnavailableError): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new ErrorType(error);
  }
}

function readerFor(db: SQLiteDatabase, ErrorType: typeof LocalCatalogUnavailableError): SqlReader {
  return {
    query: (sql, params = []) => catalogSql(() => db.getAllAsync(sql, params), ErrorType),
    queryFirst: (sql, params = []) => catalogSql(() => db.getFirstAsync(sql, params), ErrorType),
  };
}

function catalogDatabase(reader: SQLiteDatabase, writer: SQLiteDatabase): SqlDatabase {
  const tx: SqlConnection = {
    ...readerFor(writer, LocalCatalogWriteError),
    exec: (sql) => catalogSql(() => writer.execAsync(sql), LocalCatalogWriteError),
    run: (sql, params = []) => catalogSql(() => writer.runAsync(sql, params), LocalCatalogWriteError),
  };
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  };
  return {
    ...readerFor(reader, LocalCatalogReadError),
    close: async () => { await Promise.all([reader.closeAsync(), writer.closeAsync()]); },
    run: (sql, params) => enqueue(() => tx.run(sql, params)),
    transaction: (action) => enqueue(async () => {
      await tx.exec('BEGIN IMMEDIATE');
      try {
        const value = await action(tx);
        await tx.exec('COMMIT');
        return value;
      } catch (error) {
        await tx.exec('ROLLBACK').catch(() => {});
        throw error;
      }
    }),
  };
}

export async function openCatalogDatabase(): Promise<SqlDatabase> {
  const { openDatabaseAsync } = require('expo-sqlite') as typeof import('expo-sqlite');
  const name = 'synced-catalog.db';
  const writer = await openDatabaseAsync(name, { useNewConnection: true });
  try {
    // A separate read connection can browse the published revision during a write transaction.
    await writer.execAsync('PRAGMA journal_mode = WAL');
    const reader = await openDatabaseAsync(name, { useNewConnection: true });
    return catalogDatabase(reader, writer);
  } catch (error) {
    await writer.closeAsync().catch(() => {});
    throw error;
  }
}
