import { ArtworkDestinationError } from '../../data/HttpTransport';
import type { useI18n } from '../../i18n';
import { isConnectionError } from '../../session/transferAvailability';
import { wifiImportErrorMessage } from '../../session/wifiImportError';
import { isLocalizableMessage, localizedMessage } from '../localizedLabels';

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * A translated message for a failed transfer to or from the player. `fallback` is the English source shown for player
 * errors the app does not know, instead of the raw HTTP text.
 */
export function transferErrorText(cause: unknown, fallback: string, t: Translate): string {
  if (isConnectionError(cause)) return t('Connection to Compás player was lost.');
  // Phone storage errors (full, read-only, no access) arrive as raw system text.
  if (cause instanceof ArtworkDestinationError) {
    return t('Could not save the file on this phone. Check free space and file access, then try again.');
  }
  // Raw native text ("Socket closed") has no translation; the fallback says the same thing in the user's language.
  const message = wifiImportErrorMessage(cause, fallback);
  return localizedMessage(isLocalizableMessage(message) ? message : fallback, t);
}
