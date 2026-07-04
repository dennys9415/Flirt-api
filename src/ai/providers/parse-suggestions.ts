import { Suggestion } from './ai-provider.interface';

/**
 * Defensive parsing of model output. Structured outputs should guarantee the
 * shape, but a provider bug must surface as a clean 502-style error, never as
 * free-form text reaching the client (see CLAUDE.md decision #3).
 */
export class ModelOutputError extends Error {
  constructor(provider: string, detail: string) {
    super(`Invalid model output from ${provider}: ${detail}`);
  }
}

export function parseSuggestions(
  provider: string,
  raw: string,
  expectedCount: number,
): Suggestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ModelOutputError(provider, 'not valid JSON');
  }

  const suggestions = (parsed as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new ModelOutputError(provider, 'missing suggestions array');
  }

  const cleaned = suggestions
    .filter(
      (s): s is Suggestion =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Suggestion).text === 'string' &&
        (s as Suggestion).text.length > 0,
    )
    .map((s) => ({ text: s.text, style: s.style ?? 'default' }))
    .slice(0, expectedCount);

  if (cleaned.length === 0) {
    throw new ModelOutputError(provider, 'no usable suggestions');
  }
  return cleaned;
}
