import * as vscode from 'vscode';
import { CouncilMode } from './modes';

type BuildInput = {
  userText: string;
  mode: CouncilMode;
  councilGoal: string;
  memoryContext: string;
  fileContext: string;
};

export class NanoOrchestrator {
  constructor(private readonly output: vscode.OutputChannel) {}

  public buildCouncilPrompt(input: BuildInput): { councilPrompt: string; responseContract: string } {
    const responseContract =
`RESPONSE CONTRACT:
- Be concrete and self-contained.
- If giving code, include full blocks + file paths.
- If uncertain, state assumptions + safe default.
- Do not invent unknown commands.`;

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

    this.output.appendLine('[nano] built council prompt');
    return { councilPrompt, responseContract };
  }
}
