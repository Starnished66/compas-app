import { downloadToFile, pinSafeFileDownloader } from './fileDownload';
import { FetchHttpTransport, HttpTransport, SerializedHttpTransport } from './HttpTransport';

export function createWifiTransport(baseUrl: string, timeoutMs?: number): HttpTransport {
  const pinSafe = pinSafeFileDownloader();
  return new SerializedHttpTransport(new FetchHttpTransport(baseUrl, timeoutMs, pinSafe ?? downloadToFile, Boolean(pinSafe)));
}
