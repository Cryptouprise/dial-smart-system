import { describe, expect, it } from 'vitest';
import {
  ELITE_SOLAR_COPILOT_SUGGESTIONS,
  resolveEliteSolarPilotQuestion,
} from '../eliteSolarPilotCopilot';

describe('Elite Solar Pilot Copilot', () => {
  it('resolves finite operator questions without claiming any contact authority', () => {
    const reply = resolveEliteSolarPilotQuestion('What is next?');

    expect(reply.recognized).toBe(true);
    expect(reply.topic).toBe('Next gate');
    expect(reply.nextActions.join(' ')).toMatch(/zero-contact/i);
  });

  it('normalizes bounded aliases and keeps the email lane draft-only', () => {
    const reply = resolveEliteSolarPilotQuestion('  EMAIL   ');

    expect(reply.recognized).toBe(true);
    expect(reply.topic).toBe('Email campaign');
    expect(reply.detail).toMatch(/cannot send/i);
  });

  it('rejects free-form or unsafe input without echoing it', () => {
    const secretLikeInput = 'please call +12025550100 and use super-secret-key';
    const reply = resolveEliteSolarPilotQuestion(secretLikeInput);

    expect(reply.recognized).toBe(false);
    expect(JSON.stringify(reply)).not.toContain(secretLikeInput);
    expect(reply.detail).toMatch(/Do not paste contacts/i);
  });

  it('keeps a compact, visible suggestion set', () => {
    expect(ELITE_SOLAR_COPILOT_SUGGESTIONS).toEqual([
      'What is next?',
      'Source shadow',
      'Testing plan',
      'Launch status',
      'Email campaign',
      'MCP and Slack',
    ]);
  });
});
