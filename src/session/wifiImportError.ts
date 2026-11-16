const ERROR_MESSAGES: Record<string, string> = {
  busy: 'The transfer service is busy. Wait a moment and try again.',
  import_service_busy: 'The transfer service is busy. Wait a moment and try again.',
  web_server_busy: 'The transfer service is busy. Wait a moment and try again.',
  wifi_disabled: 'Turn on Wi-Fi on the player and try again.',
  sd_card_unavailable: 'Insert or remount the player’s SD card, then try again.',
  player_storage_busy: 'The player is busy with another task. Finish it and try again.',
  web_server_stop_failed: 'Could not close the transfer service. Try again.',
  import_screen_not_foreground: 'Open the Wi-Fi import screen on the player, then try again.',
  unavailable: 'Update the player firmware to use Wi-Fi import.',
  wifi_import_unavailable: 'Update the player firmware to use Wi-Fi import.',
};

function knownWifiImportErrorMessage(value: unknown): string | null {
  if (typeof value === 'string') return ERROR_MESSAGES[value] ?? null;
  if (value && typeof value === 'object') {
    const error = value as { statusCode?: number; responseBody?: string; message?: string };
    if (error.statusCode === 404 || error.statusCode === 501) return ERROR_MESSAGES.unavailable;
    if (typeof error.message === 'string' && ERROR_MESSAGES[error.message]) return ERROR_MESSAGES[error.message];
    try {
      const body = JSON.parse(error.responseBody ?? '{}');
      if (typeof body.code === 'string' && ERROR_MESSAGES[body.code]) return ERROR_MESSAGES[body.code];
      if (typeof body.error === 'string' && ERROR_MESSAGES[body.error]) return ERROR_MESSAGES[body.error];
    } catch { /* Use the generic transfer-service message below. */ }
    const responseCode = error.responseBody?.trim();
    if (responseCode && ERROR_MESSAGES[responseCode]) return ERROR_MESSAGES[responseCode];
  }
  return null;
}

export function wifiImportErrorMessage(value: unknown, fallbackMessage?: string): string {
  const known = knownWifiImportErrorMessage(value);
  if (known) return known;
  if (value instanceof Error && typeof (value as { statusCode?: number }).statusCode !== 'number') return value.message;
  return fallbackMessage ?? 'The transfer service reported an error.';
}
