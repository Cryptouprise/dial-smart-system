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
    expect(reply.detail).toMatch(/handoff proposal/i);
    expect(reply.detail).toMatch(/cannot send/i);
  });

  it('understands safe natural-language operator questions without making them actions', () => {
    const morning = resolveEliteSolarPilotQuestion('What is the morning beat for Elite Solar?');
    const launch = resolveEliteSolarPilotQuestion('Are we ready to launch?');
    const testing = resolveEliteSolarPilotQuestion('How do we test the Retell agent?');

    expect(morning).toMatchObject({ topic: 'Morning beat', recognized: true });
    expect(launch).toMatchObject({ topic: 'Launch status', recognized: true });
    expect(testing).toMatchObject({ topic: 'Testing plan', recognized: true });
    expect(JSON.stringify([morning, launch, testing])).toMatch(/cannot|locked|not authorized/i);
  });

  it('gives a no-secret evidence handoff instead of accepting contacts or credentials', () => {
    const reply = resolveEliteSolarPilotQuestion('What do you need from me?');

    expect(reply).toMatchObject({ topic: 'Live-evidence handoff', recognized: true });
    expect(reply.detail).toMatch(/does not need raw contacts or credentials/i);
    expect(reply.nextActions.join(' ')).toMatch(/zero-contact shadow/i);
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
      'Morning beat',
      'What do you need?',
      'What is next?',
      'Source shadow',
      'Testing plan',
      'Launch status',
      'Email campaign',
      'MCP and Slack',
    ]);
  });
});
