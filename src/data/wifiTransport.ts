import { downloadToFile } from './fileDownload';
import { FetchHttpTransport, HttpTransport, SerializedHttpTransport } from './HttpTransport';

export function createWifiTransport(baseUrl: string, timeoutMs?: number): HttpTransport {
  return new SerializedHttpTransport(new FetchHttpTransport(baseUrl, timeoutMs, downloadToFile));
}
