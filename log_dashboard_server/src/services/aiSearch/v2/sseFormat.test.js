const { formatSSE } = require('./sseFormat');

describe('formatSSE', () => {
  it('renders an event: and data: frame ending with a blank line', () => {
    const out = formatSSE({ type: 'text', delta: 'hi' });
    expect(out).toBe('event: text\ndata: {"type":"text","delta":"hi"}\n\n');
  });

  it('defaults the event name when type is missing', () => {
    expect(formatSSE({ foo: 1 })).toMatch(/^event: message\n/);
  });
});
