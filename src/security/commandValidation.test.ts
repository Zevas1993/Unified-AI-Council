import { describe, it, expect } from 'vitest';
import { validateCliCommand } from './commandValidation';

describe('validateCliCommand', () => {
  it('accepts simple executables', () => {
    expect(validateCliCommand('codex').ok).toBe(true);
    expect(validateCliCommand('claude').ok).toBe(true);
    expect(validateCliCommand('gemini').ok).toBe(true);
  });

  it('accepts flags and quoted args', () => {
    const r = validateCliCommand('claude --model "sonnet" --max-tokens 2000');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized).toContain('claude');
  });

  it('rejects shell metacharacters', () => {
    const bad = [
      'codex; rm -rf /',
      'claude && echo pwned',
      'gemini | cat /etc/passwd',
      'claude $(whoami)',
      'claude `whoami`'
    ];
    for (const b of bad) {
      const r = validateCliCommand(b);
      expect(r.ok).toBe(false);
    }
  });
});
