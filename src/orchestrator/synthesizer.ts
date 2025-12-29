import * as vscode from 'vscode';

export class ConsensusSynthesizer {
  constructor(private readonly output: vscode.OutputChannel) {}

  public synthesize(input: {
    mode: string;
    rubric: string;
    outputStyle: string;
    responseContract: string;
    userText: string;
    council: { codex: string; claude: string; gemini: string; };
  }): string {
    const merged = this.mergeHeuristically(input);
    const notes = [
      ['Codex', input.council.codex],
      ['Claude', input.council.claude],
      ['Gemini', input.council.gemini],
    ].map(([name, text]) => `--- ${name} ---\n${trimTo(String(text), 1800)}`).join('\n\n');

    return `${merged}\n\n## Council Notes (trimmed)\n${notes}`;
  }

  private mergeHeuristically(input: any): string {
    const lines = (input.council.codex + '\n' + input.council.claude + '\n' + input.council.gemini)
      .split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    const actionable: string[] = [];
    for (const l of lines) {
      if (looksActionable(l)) actionable.push(l);
      if (actionable.length >= 18) break;
    }

    const unique = dedupe(actionable).slice(0, 12);

    return `## Result
${input.outputStyle}

### Recommended next steps
${unique.length ? unique.map((b: string) => `- ${b}`).join('\n') : '- Provide more context/logs so the council can act.'}

### Guardrails
- ${input.rubric}
- ${input.responseContract.split('\n')[0]}
`;
  }
}

function looksActionable(line: string): boolean {
  const starts = /^(?:[-*]\s+)?(run|open|set|add|remove|update|create|install|verify|check|use|ensure|then|next|finally|1\)|2\)|3\))/i;
  const containsPath = /\b(src\/|package\.json|tsconfig\.json|settings\.json|\.vscode|wsl\.exe|bash\b)/i;
  return starts.test(line) || containsPath.test(line);
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

function trimTo(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
