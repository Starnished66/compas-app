/** Recognize transport failures for upload reconnection and error messages. */
export function isConnectionError(cause: any): boolean {
  if (typeof cause?.statusCode === 'number') return false;
  return /fetch failed|failed to connect|network request failed|connectexception|sockettimeout|timed? ?out|connection (reset|refused|abort)|broken pipe|end of stream|unreachable|import session ended/i
    .test(String(cause?.message ?? ''));
}

export function isTransferUnavailable(cause: any): boolean {
  const message = `${cause?.message ?? ''} ${cause?.responseBody ?? ''}`;
  return /sd_card_unavailable|SD card is unavailable|import session ended|import_screen_not_foreground/i.test(message);
}
