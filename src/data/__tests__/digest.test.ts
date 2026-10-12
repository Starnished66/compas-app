import { boundedMemo } from '../boundedMemo';
import { legacyCoverDigest } from '../sha256';

describe('legacyCoverDigest', () => {
  it('keeps the digests that existing cover and artwork cache file names were built from', () => {
    expect(legacyCoverDigest('')).toBe('e79226b38bc20c1f9afbf4c8996fb924cd04ee0a57618357a495991b7852b855');
    expect(legacyCoverDigest('abc')).toBe('f88723c481c7bff5414140de5dae2223d78c1e2e88dd6aa7b410ff61f20015ad');
    expect(legacyCoverDigest('library-1234|album:Abbey Road')).toBe(
      '206534b4513d5bc683aca693ecab70531b376fd9d10279909695b5fb6e042e7b',
    );
    expect(legacyCoverDigest('a'.repeat(1000))).toBe(
      '3d996b4cfca990a6ec6df3f70c571c3d23d0240bb93571e63f723eef56b16d76',
    );
  });

  it('returns an empty digest for text outside Latin-1', () => {
    expect(legacyCoverDigest('xĀy')).toBe('');
  });
});

describe('boundedMemo', () => {
  it('computes each key once and evicts the oldest key past the limit', () => {
    const compute = jest.fn((key: string) => key.toUpperCase());
    const memo = boundedMemo(compute, 2);
    expect(memo('a')).toBe('A');
    expect(memo('a')).toBe('A');
    expect(compute).toHaveBeenCalledTimes(1);
    memo('b');
    memo('c');
    memo('a');
    expect(compute).toHaveBeenCalledTimes(4);
    memo('c');
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
