import { refuseRedirect } from './redirectGuard';
import type { NativeUploadProgress } from './nativeFileUpload';
import type { FileDownloadProgress } from './fileDownload';
import type {
  WifiImportStatus,
  WifiImportDirectoryPage,
  WifiImportFileEntry,
  WifiImportUploadResult,
} from './types';
import { REMOTE_API_PREFIX, PIN_HEADER, RemoteApiException, encodeRemoteParam, assertIntegerArgument, type RemoteApiRequests } from './remoteApiProtocol';

function validateImportPath(path: string, allowRoot: boolean): string {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/') || /[\u0000-\u001f]/.test(path)) {
    throw new Error('Invalid SD card path');
  }
  const normalized = path.replace(/\/$/, '');
  if ((!allowRoot && !normalized) || (normalized && normalized.split('/').some((part) => part === '.' || part === '..' || part === ''))) {
    throw new Error('Invalid SD card path');
  }
  return normalized;
}

function validateImportName(name: string): string {
  if (typeof name !== 'string' || !name.trim() || name === '.' || name === '..' ||
      /[\\/\u0000-\u001f]/.test(name) || name.trim() !== name) {
    throw new Error('Enter a valid file name');
  }
  return name;
}

export class WifiImportApi {
  constructor(private readonly requests: Pick<RemoteApiRequests, 'jsonGet' | 'send' | 'getPin'>) {}

  async importStatus(): Promise<WifiImportStatus> {
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/import`);
    const states = ['stopped', 'starting', 'ready', 'stopping', 'error'];
    if (!states.includes(json.state) || (json.error != null && typeof json.error !== 'string')) {
      throw new Error('Invalid Wi-Fi import status response');
    }
    return { state: json.state, error: json.error ?? null };
  }

  async startImport(): Promise<void> {
    const response = await this.requests.send('POST', `${REMOTE_API_PREFIX}/import/start`);
    if (response.statusCode !== 202) throw new RemoteApiException(response.statusCode, response.text());
  }

  async stopImport(): Promise<void> {
    const response = await this.requests.send('POST', `${REMOTE_API_PREFIX}/import/stop`);
    if (response.statusCode !== 202) throw new RemoteApiException(response.statusCode, response.text());
  }

  async importFiles(path: string = '', offset: number = 0, limit: number = 50, showHidden = false): Promise<WifiImportDirectoryPage> {
    assertIntegerArgument(offset, 'Offset', 0);
    assertIntegerArgument(limit, 'Limit', 1, 100);
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/import/files`, [
      ['path', validateImportPath(path, true)], ['offset', String(offset)], ['limit', String(limit)],
      ...(showHidden ? [['show_hidden', '1'] as [string, string]] : []),
    ]);
    if (!Array.isArray(json.entries) || typeof json.path !== 'string' ||
        !Number.isSafeInteger(json.offset) || !Number.isSafeInteger(json.total) ||
        (json.next_offset !== null && !Number.isSafeInteger(json.next_offset))) {
      throw new Error('Invalid Wi-Fi import directory response');
    }
    const entries: WifiImportFileEntry[] = json.entries.map((entry: any) => {
      if (!entry || typeof entry.name !== 'string' || typeof entry.path !== 'string' ||
          typeof entry.isDirectory !== 'boolean' || !Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new Error('Invalid Wi-Fi import directory entry');
      }
      return { name: entry.name, path: entry.path, isDirectory: entry.isDirectory, size: entry.size };
    });
    return { path: json.path, entries, offset: json.offset, nextOffset: json.next_offset, total: json.total };
  }

  async downloadImportFile(
    endpoint: string,
    remotePath: string,
    fileUri: string,
    onProgress: (progress: FileDownloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const { downloadToFile } = await import('./fileDownload');
    const relativePath = validateImportPath(remotePath, false);
    const params = `path=${encodeRemoteParam(relativePath)}`;
    const headers: Record<string, string> = {};
    const pin = this.requests.getPin();
    if (pin) headers[PIN_HEADER] = pin;
    const response = await downloadToFile(
      `${endpoint.replace(/\/+$/, '')}${REMOTE_API_PREFIX}/import/files/download?${params}`,
      fileUri,
      headers,
      signal,
      onProgress,
      true,
    );
    refuseRedirect(response.status);
    if (response.status !== 200) throw new RemoteApiException(response.status, response.errorBody);
    // The native writer picks the next free name if the requested one was taken meanwhile.
    return response.savedPath ?? null;
  }

  async uploadImportFile(
    endpoint: string,
    fileUri: string,
    path: string,
    name: string,
    onProgress: (progress: NativeUploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<WifiImportUploadResult> {
    const { uploadFileNative } = await import('./nativeFileUpload');
    const relativePath = validateImportPath(path, true);
    const leaf = validateImportName(name);
    const params = `path=${encodeRemoteParam(relativePath)}&name=${encodeRemoteParam(leaf)}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    const pin = this.requests.getPin();
    if (pin) headers[PIN_HEADER] = pin;
    const response = await uploadFileNative(`${endpoint.replace(/\/+$/, '')}${REMOTE_API_PREFIX}/import/files/upload?${params}`, fileUri, headers, onProgress, signal);
    refuseRedirect(response.status);
    if (response.status !== 201) throw new RemoteApiException(response.status, response.body);
    const json = JSON.parse(response.body);
    if (json.ok !== true || typeof json.path !== 'string' || typeof json.name !== 'string' ||
        !Number.isSafeInteger(json.bytes) || json.bytes < 0) throw new Error('Invalid Wi-Fi import upload response');
    return { ok: true, path: json.path, name: json.name, bytes: json.bytes };
  }

  async renameImportFile(path: string, name: string): Promise<void> {
    const response = await this.requests.send('POST', `${REMOTE_API_PREFIX}/import/files/rename`, [
      ['path', validateImportPath(path, false)], ['name', validateImportName(name)],
    ]);
    if (response.statusCode !== 200) throw new RemoteApiException(response.statusCode, response.text());
  }

  async deleteImportFile(path: string): Promise<void> {
    const response = await this.requests.send('POST', `${REMOTE_API_PREFIX}/import/files/delete`, [
      ['path', validateImportPath(path, false)],
    ]);
    if (response.statusCode !== 200) throw new RemoteApiException(response.statusCode, response.text());
  }

  async createImportDirectory(path: string, name: string): Promise<void> {
    const response = await this.requests.send('POST', `${REMOTE_API_PREFIX}/import/files/mkdir`, [
      ['path', validateImportPath(path, true)], ['name', validateImportName(name)],
    ]);
    if (response.statusCode !== 201) throw new RemoteApiException(response.statusCode, response.text());
  }
}
