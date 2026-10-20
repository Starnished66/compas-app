import { wifiImportErrorMessage } from '../wifiImportError';

describe('wifiImportErrorMessage', () => {
  it('turns player service codes into user-facing messages', () => {
    expect(wifiImportErrorMessage('web_server_busy')).toBe('The transfer service is busy. Wait a moment and try again.');
    expect(wifiImportErrorMessage('sd_card_unavailable')).toBe('Insert or remount the player’s SD card, then try again.');
  });

  it('reads structured API error codes and hides unknown machine codes', () => {
    expect(wifiImportErrorMessage({ statusCode: 409, responseBody: '{"error":"import_service_busy","code":"busy"}' }))
      .toBe('The transfer service is busy. Wait a moment and try again.');
    expect(wifiImportErrorMessage('internal_error')).toBe('The transfer service reported an error.');
  });
});
