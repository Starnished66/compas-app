/** Turns a native transfer rejection back into the plain error the old Expo path produced. */
export function nativeTransferError(error: unknown): Error {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (code === 'ERR_TRANSFER_CANCELLED') return new Error('Upload cancelled');
  const text = typeof message === 'string' ? message : '';
  // Expo wraps the native message as "Call to function ... has been rejected.\n→ Caused by: <original>".
  const cause = /→ Caused by: ([\s\S]*)$/.exec(text)?.[1];
  return cause ? new Error(cause.trim()) : error instanceof Error ? error : new Error(text || 'Transfer failed');
}
