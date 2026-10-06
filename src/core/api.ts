/**
 * Compatibility exports for the original migration layout.
 * The active API implementation lives in src/data and is the single source of truth.
 */
export { RemoteApi, RemoteApiException } from '../data/RemoteApi';
export * from '../data/types';
export { FetchHttpTransport, SerializedHttpTransport } from '../data/HttpTransport';
