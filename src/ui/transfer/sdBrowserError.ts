import { nativeTransferError } from '../../data/nativeTransferError';
import { isConnectionError, isTransferUnavailable } from '../../session/transferAvailability';

/** Keep transport details out of both SD browsers' user-facing errors. */
export function sdBrowserError(cause: unknown, t: (source: string) => string): string {
  const error = nativeTransferError(cause);
  const failure = cause as { statusCode?: number; responseBody?: string } | null;
  if (isTransferUnavailable(cause)) return t('The player SD card is unavailable');
  if (isConnectionError({ ...failure, message: error.message })) return t('Connection to Compás player was lost.');
  if (failure?.statusCode === 404 || /folder_not_found|Remote API returned HTTP 404\b/i.test(`${error.message} ${failure?.responseBody ?? ''}`)) {
    return t('Could not read this folder.');
  }
  switch (error.message) {
    case 'Enter a valid file name': return t('Enter a valid file name');
    case 'The player cannot rename files on this SD card.': return t('The player cannot rename files on this SD card.');
    case 'Could not rename file.': return t('Could not rename file.');
    case 'Could not delete file.': return t('Could not delete file.');
    case 'Could not read this folder.': return t('Could not read this folder.');
    case 'Could not read the SD card.': return t('Could not read the SD card.');
    default: return t('Could not complete the selected action.');
  }
}
