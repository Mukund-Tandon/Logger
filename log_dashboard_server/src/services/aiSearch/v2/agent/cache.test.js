const { normalizeQuestion, get, set, clear } = require('./cache');

beforeEach(() => clear());

describe('normalizeQuestion', () => {
  it('lowercases, trims, collapses whitespace, strips trailing punctuation', () => {
    expect(normalizeQuestion('  How many   ERRORS?? ')).toBe('how many errors');
  });
  it('maps trivially-different phrasings to the same key', () => {
    expect(normalizeQuestion('Why did X spike.')).toBe(normalizeQuestion('why did x spike'));
  });
});

describe('TTL cache', () => {
  it('returns a set value before expiry', () => {
    set('k', { answer: 'v' }, 1000, 0);
    expect(get('k', 500)).toEqual({ answer: 'v' });
  });
  it('misses after expiry', () => {
    set('k', { answer: 'v' }, 1000, 0);
    expect(get('k', 1001)).toBeUndefined();
  });
  it('misses for unknown keys', () => {
    expect(get('nope')).toBeUndefined();
  });
});
