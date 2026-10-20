import { boundJsErrorFields, MAX_JS_ERROR_FIELD_LENGTH } from '../../../modules/compas-diagnostics/src';

describe('JavaScript diagnostic bounds', () => {
  it('caps message and stack fields before sending them over the native bridge', () => {
    const [message, stack] = boundJsErrorFields('m'.repeat(MAX_JS_ERROR_FIELD_LENGTH + 5), 's'.repeat(MAX_JS_ERROR_FIELD_LENGTH + 7));
    expect(message).toHaveLength(MAX_JS_ERROR_FIELD_LENGTH);
    expect(stack).toHaveLength(MAX_JS_ERROR_FIELD_LENGTH);
  });

  it('preserves a missing stack as null', () => {
    expect(boundJsErrorFields('error', null)).toEqual(['error', null]);
  });
});

describe('JavaScript fatal error capture', () => {
  const original = (globalThis as any).ErrorUtils;
  afterEach(() => {
    (globalThis as any).ErrorUtils = original;
    jest.resetModules();
    jest.dontMock('expo-modules-core');
  });

  it('captures only fatal errors, chains the prior handler and installs once', () => {
    const recordJsError = jest.fn();
    jest.doMock('expo-modules-core', () => ({ requireNativeModule: () => ({ recordJsError }) }));
    const previous = jest.fn();
    const setGlobalHandler = jest.fn();
    (globalThis as any).ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler };
    jest.isolateModules(() => {
      const diagnostics = require('../../../modules/compas-diagnostics/src');
      diagnostics.installJavaScriptCrashCapture();
      diagnostics.installJavaScriptCrashCapture();
      expect(setGlobalHandler).toHaveBeenCalledTimes(1);
      const handler = setGlobalHandler.mock.calls[0][0];
      const error = new Error('Failure');
      handler(error, false);
      expect(recordJsError).not.toHaveBeenCalled();
      handler(error, true);
      expect(recordJsError).toHaveBeenCalledWith('Failure', error.stack, true);
      expect(previous).toHaveBeenCalledTimes(2);
    });
  });

  it('still invokes the application handler when native reporting throws', () => {
    jest.doMock('expo-modules-core', () => ({ requireNativeModule: () => ({ recordJsError: () => { throw new Error('Storage unavailable'); } }) }));
    const previous = jest.fn();
    const setGlobalHandler = jest.fn();
    (globalThis as any).ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler };
    jest.isolateModules(() => {
      require('../../../modules/compas-diagnostics/src').installJavaScriptCrashCapture();
      const error = new Error('Original fatal error');
      expect(() => setGlobalHandler.mock.calls[0][0](error, true)).not.toThrow();
      expect(previous).toHaveBeenCalledWith(error, true);
    });
  });
});
