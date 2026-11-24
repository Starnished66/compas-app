import type { useI18n } from '../../i18n';
import { nativeTransferError } from '../../data/nativeTransferError';
import { localizedMessage } from '../localizedLabels';

type Translate = ReturnType<typeof useI18n>['t'];

// Internal checks a user cannot act on; they read as the translated generic error instead.
const INTERNAL_MESSAGES = new Set(['Transfer failed', 'Expected an absolute path', 'Expected a file URI']);

/** Native errors arrive wrapped by Expo; translate the original message, not the wrapper. */
export function localizedCause(cause: unknown, fallback: string, t: Translate): string {
  const message = nativeTransferError(cause).message;
  return message && !INTERNAL_MESSAGES.has(message) ? localizedMessage(message, t) : fallback;
}
