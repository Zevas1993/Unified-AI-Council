import * as vscode from 'vscode';
import { EmbeddedLlm } from '../llm/embeddedLlm';

export interface SynthesisInput {
  mode: string;
  rubric: string;
  outputStyle: string;
  responseContract: string;
  userText: string;
  council: { codex: string; claude: string; gemini: string };
}

export class ConsensusSynthesizer {
  constructor(private readonly output: vscode.OutputChannel) {}

  /**
   * Synthesize council responses using heuristic merging (no LLM).
   * This is the fallback when embedded LLM is unavailable.
   */
  public synthesize(input: SynthesisInput): string {
    const merged = this.mergeHeuristically(input);
    const notes = this.formatCouncilNotes(input.council);

    return `${merged}\n\n## Council Notes (trimmed)\n${notes}`;
  }

  /**
   * Synthesize council responses using embedded LLM for intelligent merging.
   * The LLM identifies agreements, resolves conflicts, and produces a unified answer.
   */
  public async synthesizeWithLlm(
    input: SynthesisInput,
    llm: EmbeddedLlm,
    maxTokens: number = 300
  ): Promise<string> {
    const synthesisPrompt = `You are synthesizing responses from a 3-member AI coding council. Produce a unified, actionable response.

Mode: ${input.mode}
User request: ${input.userText}

Council responses:
- Codex: ${this.trimTo(input.council.codex, 500)}
- Claude: ${this.trimTo(input.council.claude, 500)}
- Gemini: ${this.trimTo(input.council.gemini, 500)}

Instructions:
1. Identify areas of agreement across all responses
2. Resolve any conflicts by choosing the most accurate/complete answer
3. Produce a concise, actionable synthesis with clear next steps

Synthesized response:`;

    let synthesis: string;
    try {
      synthesis = await llm.generate(synthesisPrompt, { maxTokens });
      this.output.appendLine('[synth] LLM synthesis completed');
    } catch (err) {
      // Fallback to heuristic synthesis if LLM fails
      const errMsg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[synth] LLM synthesis failed, using heuristic: ${errMsg}`);
      return this.synthesize(input);
    }

    const notes = this.formatCouncilNotes(input.council);
    return `## Synthesized Result\n${synthesis}\n\n## Council Notes (trimmed)\n${notes}`;
  }

  /**
   * Format council notes for display.
   */
  private formatCouncilNotes(council: { codex: string; claude: string; gemini: string }): string {
    return [
      ['Codex', council.codex],
      ['Claude', council.claude],
      ['Gemini', council.gemini],
    ].map(([name, text]) => `--- ${name} ---\n${this.trimTo(String(text), 1800)}`).join('\n\n');
  }

  /**
   * Heuristic-based merging of council responses.
   */
  private mergeHeuristically(input: SynthesisInput): string {
    const lines = (input.council.codex + '\n' + input.council.claude + '\n' + input.council.gemini)
      .split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    const actionable: string[] = [];
    for (const l of lines) {
      if (this.looksActionable(l)) actionable.push(l);
      if (actionable.length >= 18) break;
    }

    const unique = this.dedupe(actionable).slice(0, 12);

    return `## Result
${input.outputStyle}

### Recommended next steps
${unique.length ? unique.map((b: string) => `- ${b}`).join('\n') : '- Provide more context/logs so the council can act.'}

### Guardrails
- ${input.rubric}
- ${input.responseContract.split('\n')[0]}
`;
  }

  private looksActionable(line: string): boolean {
    const starts = /^(?:[-*]\s+)?(run|open|set|add|remove|update|create|install|verify|check|use|ensure|then|next|finally|1\)|2\)|3\))/i;
    const containsPath = /\b(src\/|package\.json|tsconfig\.json|settings\.json|\.vscode|wsl\.exe|bash\b)/i;
    return starts.test(line) || containsPath.test(line);
  }

  private dedupe(arr: string[]): string[] {
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

  private trimTo(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '...';
  }
}
