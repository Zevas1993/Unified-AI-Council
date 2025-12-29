/**
 * Very small, practical command validator for running user-configured CLIs.
 *
 * Goal: allow commands like:
 *   codex
 *   claude --project myproj
 *   gemini "--some-flag=hello world"
 *
 * ...while rejecting obvious shell metacharacters that enable command chaining
 * or substitution (e.g. `;`, `&&`, `|`, backticks, `$()`, redirection, newlines).
 */

export type CommandValidationResult = {
  ok: boolean;
  normalized?: string;
  reason?: string;
};

const DEFAULT_ALLOWED_EXECUTABLES = new Set([
  'codex',
  'claude',
  'gemini',
]);

function normalizeWhitespace(cmd: string): string {
  return cmd
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstToken(cmd: string): string | null {
  // naive tokenization: first run of non-space chars. Works for our allowlist
  // and paths like /usr/bin/codex.
  const m = cmd.trim().match(/^(\S+)/);
  return m ? m[1] : null;
}

export function validateCliCommand(cmd: string): CommandValidationResult {
  const normalized = normalizeWhitespace(cmd);
  if (!normalized) return { ok: false, reason: 'Empty command.' };

  // Reject newlines (after normalization there shouldn't be any, but belt+suspenders).
  if (/[\r\n]/.test(cmd)) return { ok: false, reason: 'Newlines are not allowed in CLI command.' };

  // Reject shell metacharacters / command substitution / redirection.
  // This is intentionally conservative.
  const forbidden = /[;&|`<>]/;
  if (forbidden.test(normalized)) {
    return { ok: false, reason: 'Command contains forbidden shell metacharacters.' };
  }

  // Reject $() / ${} / bare $ (common command substitution and env expansion)
  if (/(\$\(|\$\{|\$\w)/.test(normalized)) {
    return { ok: false, reason: 'Command contains forbidden $-expansion or substitution.' };
  }

  // Reject "&&" and "||" explicitly (even though & and | are already caught).
  if (/\&\&|\|\|/.test(normalized)) {
    return { ok: false, reason: 'Command chaining is not allowed.' };
  }

  // Reject quotes that are clearly unbalanced (quick sanity check).
  const singleQuotes = (normalized.match(/'/g) ?? []).length;
  const doubleQuotes = (normalized.match(/\"/g) ?? []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
    return { ok: false, reason: 'Unbalanced quotes in command.' };
  }

  const exe = firstToken(normalized);
  if (!exe) return { ok: false, reason: 'Unable to parse executable.' };

  // Allow:
  // - explicit allowlisted executables (codex/claude/gemini)
  // - simple paths (e.g. /usr/bin/codex) that end in an allowlisted name
  // - do NOT allow .exe here because this is intended for WSL/Linux side.
  const exeBasename = exe.split('/').pop() ?? exe;
  if (!DEFAULT_ALLOWED_EXECUTABLES.has(exeBasename)) {
    return {
      ok: false,
      reason: `Executable must be one of: ${Array.from(DEFAULT_ALLOWED_EXECUTABLES).join(', ')}`,
    };
  }

  // Ensure executable token doesn't contain weird chars.
  // Allow slashes for paths.
  if (!/^[A-Za-z0-9._\/-]+$/.test(exe)) {
    return { ok: false, reason: 'Executable contains invalid characters.' };
  }

  return { ok: true, normalized };
}
