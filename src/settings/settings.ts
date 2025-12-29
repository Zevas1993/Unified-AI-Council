import * as vscode from 'vscode';
import { validateCliCommand } from '../security/commandValidation';

export class Settings {
  private cfg() { return vscode.workspace.getConfiguration('unifiedAiCouncil'); }

  wslDistro(): string { return String(this.cfg().get('wsl.distro') ?? '').trim(); }
  wslShell(): string { return String(this.cfg().get('wsl.shell') ?? 'bash').trim() || 'bash'; }

  /**
   * Returns a validated and normalized command string.
   * If invalid, returns the safe default (and callers should show the reason).
   */
  private safeCommand(settingKey: string, fallback: string): { cmd: string; error?: string } {
    const raw = String(this.cfg().get(settingKey) ?? fallback).trim() || fallback;
    const r = validateCliCommand(raw);
    if (r.ok && r.normalized) return { cmd: r.normalized };
    if (r.ok) return { cmd: raw }; // Fallback if normalized is unexpectedly undefined
    return { cmd: fallback, error: `Invalid ${settingKey}: ${r.reason}` };
  }

  codexCommand(): { cmd: string; error?: string } {
    return this.safeCommand('cli.codex.command', 'codex');
  }

  claudeCommand(): { cmd: string; error?: string } {
    return this.safeCommand('cli.claude.command', 'claude');
  }

  geminiCommand(): { cmd: string; error?: string } {
    return this.safeCommand('cli.gemini.command', 'gemini');
  }

  cliTimeoutMs(): number {
    const n = Number(this.cfg().get('cli.timeoutMs') ?? 180000);
    return Number.isFinite(n) && n > 5000 ? n : 180000;
  }

  maxContextChars(): number {
    const n = Number(this.cfg().get('orchestrator.maxContextChars') ?? 14000);
    return Number.isFinite(n) && n > 1000 ? n : 14000;
  }

  orchestratorEngine(): 'nano' | 'ollama' {
    const v = String(this.cfg().get('orchestrator.engine') ?? 'nano').trim();
    return v === 'ollama' ? 'ollama' : 'nano';
  }

  ollamaConfig() {
    const cfg = this.cfg();
    const baseUrl = String(cfg.get('orchestrator.ollama.baseUrl') ?? 'http://localhost:11434').trim() || 'http://localhost:11434';
    const model = String(cfg.get('orchestrator.ollama.model') ?? 'llama3.2:3b').trim() || 'llama3.2:3b';
    const temperature = Number(cfg.get('orchestrator.ollama.temperature') ?? 0.2);
    const topP = Number(cfg.get('orchestrator.ollama.topP') ?? 0.9);
    const maxTokens = Number(cfg.get('orchestrator.ollama.maxTokens') ?? 800);
    return {
      baseUrl,
      model,
      temperature: Number.isFinite(temperature) ? temperature : 0.2,
      topP: Number.isFinite(topP) ? topP : 0.9,
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 50 ? maxTokens : 800,
    };
  }
}
