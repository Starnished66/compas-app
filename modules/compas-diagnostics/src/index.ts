export type PendingCrashReport = { id: string; text: string };
export const MAX_JS_ERROR_FIELD_LENGTH = 24 * 1024;

export function boundJsErrorFields(message: string, stack: string | null): [string, string | null] {
  return [message.slice(0, MAX_JS_ERROR_FIELD_LENGTH), stack?.slice(0, MAX_JS_ERROR_FIELD_LENGTH) ?? null];
}

type DiagnosticsNativeModule = {
  getPendingReport(): PendingCrashReport | null;
  clearReport(id: string): boolean;
  copyReport(id: string): boolean;
  recordJsError(message: string, stack: string | null, fatal: boolean): boolean;
};

let nativeModule: DiagnosticsNativeModule | null = null;
try {
  // Expo Go and web have no CompasDiagnostics native module.
  const { requireNativeModule } = require('expo-modules-core');
  nativeModule = requireNativeModule('CompasDiagnostics');
} catch {
  nativeModule = null;
}

export function getPendingReport(): PendingCrashReport | null {
  try {
    return nativeModule?.getPendingReport() ?? null;
  } catch {
    return null;
  }
}

export function clearReport(id: string): boolean {
  try {
    return nativeModule?.clearReport(id) ?? false;
  } catch {
    return false;
  }
}

export function copyReport(id: string): boolean {
  try {
    return nativeModule?.copyReport(id) ?? false;
  } catch {
    return false;
  }
}

export function recordJsError(message: string, stack: string | null, fatal: boolean): void {
  try {
    const [boundedMessage, boundedStack] = boundJsErrorFields(message, stack);
    nativeModule?.recordJsError(boundedMessage, boundedStack, fatal);
  } catch {
    // Error reporting must never replace or interrupt the application's handler.
  }
}

let installed = false;

/** Install at the very beginning of index.ts, before importing the application tree. */
export function installJavaScriptCrashCapture(): void {
  if (installed) return;
  installed = true;
  try {
    const errorUtils = (globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    }).ErrorUtils;
    if (!errorUtils?.setGlobalHandler) return;
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      try {
        if (isFatal) recordJsError(String(error?.message ?? error), error?.stack ?? null, true);
      } finally {
        previous?.(error, isFatal);
      }
    });
  } catch {
    // Capture setup is best effort; app startup remains available without the module.
  }
}
