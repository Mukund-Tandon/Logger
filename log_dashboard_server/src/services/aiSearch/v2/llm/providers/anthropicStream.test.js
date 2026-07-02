const { translateStreamEvent, anthropicProvider } = require('./anthropic');

describe('translateStreamEvent (Anthropic SDK stream event → neutral)', () => {
  it('maps a text_delta to a neutral text event', () => {
    const ev = translateStreamEvent({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hel' },
    });
    expect(ev).toEqual({ type: 'text', delta: 'Hel' });
  });

  it('ignores non-text events (returns null)', () => {
    expect(translateStreamEvent({ type: 'message_start' })).toBeNull();
    expect(translateStreamEvent({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } })).toBeNull();
    expect(translateStreamEvent({ type: 'message_stop' })).toBeNull();
  });
});

describe('anthropicProvider.stream', () => {
  it('exposes a stream() method', () => {
    expect(typeof anthropicProvider.stream).toBe('function');
  });
});
