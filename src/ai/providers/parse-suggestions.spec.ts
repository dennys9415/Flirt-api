import { ModelOutputError, parseSuggestions } from './parse-suggestions';

describe('parseSuggestions', () => {
  const valid = JSON.stringify({
    suggestions: [
      { text: 'Reply one', style: 'playful' },
      { text: 'Reply two', style: 'curious' },
      { text: 'Reply three', style: 'confident' },
    ],
  });

  it('parses valid model output', () => {
    const result = parseSuggestions('test', valid, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: 'Reply one', style: 'playful' });
  });

  it('rejects non-JSON output', () => {
    expect(() => parseSuggestions('test', 'sure, here you go!', 3)).toThrow(
      ModelOutputError,
    );
  });

  it('rejects JSON without a suggestions array', () => {
    expect(() =>
      parseSuggestions('test', JSON.stringify({ replies: [] }), 3),
    ).toThrow('missing suggestions array');
  });

  it('rejects an empty suggestions array', () => {
    expect(() =>
      parseSuggestions('test', JSON.stringify({ suggestions: [] }), 3),
    ).toThrow('missing suggestions array');
  });

  it('drops malformed entries and keeps usable ones', () => {
    const mixed = JSON.stringify({
      suggestions: [
        { text: 'Good', style: 'playful' },
        { text: '' }, // empty text — dropped
        { nope: true }, // no text — dropped
        { text: 'Also good' }, // missing style — defaulted
      ],
    });
    const result = parseSuggestions('test', mixed, 3);
    expect(result).toEqual([
      { text: 'Good', style: 'playful' },
      { text: 'Also good', style: 'default' },
    ]);
  });

  it('rejects output where nothing is usable', () => {
    const junk = JSON.stringify({ suggestions: [{ text: '' }, { x: 1 }] });
    expect(() => parseSuggestions('test', junk, 3)).toThrow(
      'no usable suggestions',
    );
  });

  it('caps results at the expected count', () => {
    const five = JSON.stringify({
      suggestions: Array.from({ length: 5 }, (_, i) => ({
        text: `Reply ${i}`,
        style: 's',
      })),
    });
    expect(parseSuggestions('test', five, 3)).toHaveLength(3);
  });
});
