import * as vscode from 'vscode';
import { CouncilMode } from './modes';
import { EmbeddedLlm } from '../llm/embeddedLlm';

export type BuildInput = {
  userText: string;
  mode: CouncilMode;
  councilGoal: string;
  memoryContext: string;
  fileContext: string;
};

export class NanoOrchestrator {
  constructor(private readonly output: vscode.OutputChannel) {}

  /**
   * Build the response contract string used by council members.
   */
  private buildResponseContract(): string {
    return `RESPONSE CONTRACT:
- Be concrete and self-contained.
- If giving code, include full blocks + file paths.
- If uncertain, state assumptions + safe default.
- Do not invent unknown commands.`;
  }

  /**
   * Build council prompt using heuristic templates (no LLM).
   * This is the fallback when embedded LLM is unavailable.
   */
  public buildCouncilPrompt(input: BuildInput): { councilPrompt: string; responseContract: string } {
    const responseContract = this.buildResponseContract();

    const councilPrompt =
`You are one member of a 3-CLI council (Codex, Claude Code, Gemini).
MODE: ${input.mode.toUpperCase()}
GOAL: ${input.councilGoal}

USER:
${input.userText}

PROJECT MEMORY:
${input.memoryContext}

WORKSPACE HINTS:
${input.fileContext}

${responseContract}
Provide your best contribution for this mode.`;

    this.output.appendLine('[nano] built council prompt (heuristic)');
    return { councilPrompt, responseContract };
  }

  /**
   * Build council prompt using embedded LLM for intelligent pre-pass.
   * The LLM analyzes the user request and generates an optimized prompt.
   */
  public async buildCouncilPromptWithLlm(
    input: BuildInput,
    llm: EmbeddedLlm,
    maxTokens: number = 150
  ): Promise<{ councilPrompt: string; responseContract: string }> {
    const responseContract = this.buildResponseContract();

    // Pre-pass: Use LLM to optimize the user request into a focused prompt
    const prePassPrompt = `You are a prompt engineer. Analyze this user request and generate a focused, specific prompt for an AI coding assistant.

Mode: ${input.mode}
Goal: ${input.councilGoal}
User request: ${input.userText}

Generate a clear, actionable prompt (2-3 sentences) that will get the best response. Focus on the key requirements and constraints.`;

    let optimizedTask: string;
    try {
      optimizedTask = await llm.generate(prePassPrompt, { maxTokens });
      this.output.appendLine('[nano] LLM pre-pass completed');
    } catch (err) {
      // Fallback to original user text if LLM fails
      const errMsg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[nano] LLM pre-pass failed, using original: ${errMsg}`);
      optimizedTask = input.userText;
    }

    const councilPrompt =
`You are one member of a 3-CLI council (Codex, Claude Code, Gemini).
MODE: ${input.mode.toUpperCase()}
GOAL: ${input.councilGoal}

TASK:
${optimizedTask}

PROJECT MEMORY:
${input.memoryContext}

WORKSPACE HINTS:
${input.fileContext}

${responseContract}
Provide your best contribution for this mode.`;

    this.output.appendLine('[nano] built council prompt (LLM-enhanced)');
    return { councilPrompt, responseContract };
  }
}
