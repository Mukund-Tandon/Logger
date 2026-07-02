const { buildJudgePrompt, parseVerdict, judge } = require('./judge');

describe('parseVerdict', () => {
  it('parses a bare JSON verdict', () => {
    expect(parseVerdict('{"pass":true,"reason":"names the deploy"}')).toEqual({
      pass: true,
      reason: 'names the deploy',
    });
  });
  it('strips code fences and prose', () => {
    const v = parseVerdict('Sure:\n```json\n{"pass":false,"reason":"no root cause"}\n```');
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/root cause/);
  });
  it('coerces truthy string forms', () => {
    expect(parseVerdict('{"pass":"yes","reason":"ok"}').pass).toBe(true);
    expect(parseVerdict('{"pass":"no","reason":"x"}').pass).toBe(false);
  });
  it('fails closed when no verdict can be parsed', () => {
    const v = parseVerdict('the model rambled without json');
    expect(v.pass).toBe(false);
    expect(v.reason).toBeTruthy();
  });
});

describe('buildJudgePrompt', () => {
  it('includes the question, answer, rubric and asks for JSON only', () => {
    const p = buildJudgePrompt('why did X spike?', 'because of deploy Y', 'must name deploy Y');
    expect(p).toMatch(/why did X spike/);
    expect(p).toMatch(/deploy Y/);
    expect(p).toMatch(/must name deploy Y/);
    expect(p).toMatch(/json/i);
    expect(p).toMatch(/pass/);
  });
});

describe('judge', () => {
  const provider = (text) => ({ name: 'fake', async complete() { return { text, toolCalls: [], stopReason: 'end', usage: {} }; } });

  it('returns the parsed verdict from the judge model', async () => {
    const v = await judge(
      { question: 'q', answer: 'a', rubric: 'r' },
      { provider: provider('{"pass":true,"reason":"good"}') }
    );
    expect(v.pass).toBe(true);
    expect(v.reason).toBe('good');
  });

  it('fails closed if the judge provider throws', async () => {
    const boom = { name: 'boom', async complete() { throw new Error('judge down'); } };
    const v = await judge({ question: 'q', answer: 'a', rubric: 'r' }, { provider: boom });
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/judge/i);
  });
});
