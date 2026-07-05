import { buildRefinePrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompts';

describe('prompts', () => {
  it('system prompt encodes the safety rules', () => {
    expect(SYSTEM_PROMPT).toContain('Never be crude');
    expect(SYSTEM_PROMPT).toContain('Return ONLY JSON');
  });

  it('builds the user prompt with tone guidance and count', () => {
    const prompt = buildUserPrompt({
      message: 'Hey, how was your weekend?',
      tone: 'light_flirt',
      intent: 'reply',
      appHint: 'tinder',
      personalityTraits: ['funny', 'confident'],
      count: 3,
    });
    expect(prompt).toContain('"Hey, how was your weekend?"');
    expect(prompt).toContain('light_flirt');
    expect(prompt).toContain('Playful, warm'); // tone guidance injected
    expect(prompt).toContain('app=tinder');
    expect(prompt).toContain('funny, confident');
    expect(prompt).toContain('Produce 3 reply suggestions');
  });

  it('handles missing optional context', () => {
    const prompt = buildUserPrompt({
      message: 'Hi',
      tone: 'professional',
      intent: 'reply',
      count: 3,
    });
    expect(prompt).toContain('app=unknown');
    expect(prompt).toContain('Personality hints: none');
    expect(prompt).toContain('No flirtation'); // professional guidance
  });

  it('builds refine prompts per action', () => {
    expect(buildRefinePrompt('Some reply', 'shorter')).toContain('shorter');
    expect(buildRefinePrompt('Some reply', 'funnier')).toContain('humor');
    expect(buildRefinePrompt('Some reply', 'more_direct')).toContain(
      'more confident',
    );
    expect(buildRefinePrompt('Some reply', 'shorter')).toContain('"Some reply"');
  });
});
