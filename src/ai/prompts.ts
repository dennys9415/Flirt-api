import {
  GenerateRepliesInput,
  RefineAction,
  Tone,
} from './providers/ai-provider.interface';

/**
 * Prompt templates — source of truth is flirt-docs/AI_PROMPTS.md.
 * Written provider-agnostically; each adapter maps them to its vendor API.
 */

const TONE_GUIDANCE: Record<Tone, string> = {
  light_flirt: 'Playful, warm, low-risk. A little charm, never crude.',
  deep_flirt: 'Bolder, more direct interest. Confident, still respectful.',
  funny: 'Lead with humor; witty, teasing, light.',
  confident: 'Self-assured, concise, no neediness.',
  professional:
    'Friendly-professional (Slack/LinkedIn/Gmail). No flirtation at all.',
};

export const SYSTEM_PROMPT = `You are Flirt, an assistant that writes short, natural reply suggestions for
messaging and dating apps. You will be given a received message and a target tone.

Rules:
- Write replies as the USER would send them (first person, casual).
- Match the requested tone exactly.
- Keep each reply concise (1-2 sentences) and easy to send as-is.
- Sound human: no cliches, no pickup-artist lines, no over-explaining.
- Never be crude, demeaning, coercive, or sexually explicit.
- If the received message signals discomfort, disinterest, or is about a minor or
  anything unsafe, refuse by returning a single respectful, de-escalating suggestion.
- Return ONLY JSON matching the provided schema.`;

export function buildUserPrompt(input: GenerateRepliesInput): string {
  const traits = input.personalityTraits?.length
    ? input.personalityTraits.join(', ')
    : 'none';
  return `Received message: "${input.message}"
Target tone: ${input.tone} — ${TONE_GUIDANCE[input.tone]}
Intent: ${input.intent}
Context: app=${input.appHint ?? 'unknown'}
Personality hints: ${traits}

Produce ${input.count} reply suggestions.`;
}

const REFINE_INSTRUCTIONS: Record<RefineAction, string> = {
  shorter: 'Rewrite the reply to be noticeably shorter, same tone and meaning.',
  funnier: 'Add light humor without changing the core intent.',
  more_direct: 'Make the interest/ask clearer and more confident.',
};

export function buildRefinePrompt(text: string, action: RefineAction): string {
  return `${REFINE_INSTRUCTIONS[action]}

Reply to refine: "${text}"

Produce 1 reply suggestion.`;
}
