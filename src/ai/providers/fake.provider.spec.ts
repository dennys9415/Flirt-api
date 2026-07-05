import { FakeProvider } from './fake.provider';

describe('FakeProvider', () => {
  const provider = new FakeProvider();

  it('returns the requested number of suggestions', async () => {
    const result = await provider.generateReplies({
      message: 'Hello there',
      tone: 'funny',
      intent: 'reply',
      count: 3,
    });
    expect(result.suggestions).toHaveLength(3);
    expect(result.model).toBe('fake-model-v1');
    expect(result.suggestions[0].text).toContain('funny');
  });

  it('refines deterministically', async () => {
    const result = await provider.refine({ text: 'Hi', action: 'shorter' });
    expect(result.text).toBe('[shorter] Hi');
  });
});
