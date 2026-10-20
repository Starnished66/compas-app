jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  createUploadTask: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { uploadFileNative } from '../nativeFileUpload';

const createUploadTask = jest.mocked(FileSystem.createUploadTask);

describe('native raw file upload', () => {
  beforeEach(() => createUploadTask.mockReset());

  it('uses binary content and reports native byte progress', async () => {
    const task = { uploadAsync: jest.fn(async () => ({ status: 201, body: '{"ok":true}' })), cancelAsync: jest.fn() };
    const progress = jest.fn();
    createUploadTask.mockImplementationOnce((_url, _uri, options, callback) => {
      expect(options?.uploadType).toBe(FileSystem.FileSystemUploadType.BINARY_CONTENT);
      callback?.({ totalBytesSent: 8, totalBytesExpectedToSend: 10 });
      return task as any;
    });
    await expect(uploadFileNative('http://player:8899/upload', 'file:///cache/audio.flac', { 'X-Compas-PIN': '123456' }, progress))
      .resolves.toEqual({ status: 201, body: '{"ok":true}' });
    expect(createUploadTask).toHaveBeenCalledWith(
      'http://player:8899/upload', 'file:///cache/audio.flac',
      { httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'X-Compas-PIN': '123456' } },
      expect.any(Function),
    );
    expect(progress).toHaveBeenCalledWith({ sent: 8, total: 10 });
  });

  it('cancels the native task when its session abort signal fires', async () => {
    const controller = new AbortController();
    let rejectUpload!: (error: Error) => void;
    const task = {
      uploadAsync: jest.fn(() => new Promise((_resolve, reject) => { rejectUpload = reject; })),
      cancelAsync: jest.fn(async () => { rejectUpload(new Error('native cancelled')); }),
    };
    createUploadTask.mockReturnValueOnce(task as any);
    const pending = uploadFileNative('http://player:8899/upload', 'file:///cache/audio.flac', {}, () => {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('Upload cancelled');
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('suppresses late progress and keeps a completed server response when abort races completion', async () => {
    const controller = new AbortController();
    let progressCallback!: (event: any) => void;
    let resolveUpload!: (result: { status: number; body: string }) => void;
    const task = {
      uploadAsync: jest.fn(() => new Promise((resolve) => { resolveUpload = resolve; })),
      cancelAsync: jest.fn(async () => {}),
    };
    const progress = jest.fn();
    createUploadTask.mockImplementationOnce((_url, _uri, _options, callback) => {
      progressCallback = callback!;
      return task as any;
    });
    const pending = uploadFileNative('http://player:8899/upload', 'file:///cache/audio.flac', {}, progress, controller.signal);
    controller.abort();
    progressCallback({ totalBytesSent: 9, totalBytesExpectedToSend: 10 });
    resolveUpload({ status: 201, body: '{"ok":true}' });
    await expect(pending).resolves.toEqual({ status: 201, body: '{"ok":true}' });
    expect(progress).not.toHaveBeenCalled();
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('surfaces cancel failures and bounds a native cancel that never settles', async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      const cancelFailure = new Error('native cancel failed');
      const task = { uploadAsync: jest.fn(() => new Promise(() => {})), cancelAsync: jest.fn(async () => { throw cancelFailure; }) };
      createUploadTask.mockReturnValueOnce(task as any);
      const failedCancel = uploadFileNative('http://player:8899/upload', 'file:///cache/a', {}, () => {}, controller.signal);
      controller.abort();
      await expect(failedCancel).rejects.toBe(cancelFailure);

      const freshController = new AbortController();
      const freshTask = { uploadAsync: jest.fn(() => new Promise(() => {})), cancelAsync: jest.fn(() => new Promise(() => {})) };
      createUploadTask.mockReturnValueOnce(freshTask as any);
      const bounded = uploadFileNative('http://player:8899/upload', 'file:///cache/c', {}, () => {}, freshController.signal);
      const boundedExpectation = expect(bounded).rejects.toThrow('Upload cancellation timed out');
      freshController.abort();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(5000);
      await boundedExpectation;
    } finally {
      jest.useRealTimers();
    }
  });
});
