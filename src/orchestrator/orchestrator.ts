import * as vscode from 'vscode';
import { MODE_PROFILES, CouncilMode, ModeProfile } from './modes';
import { WslCliRunner } from '../cli/wslCliRunner';
import { ProjectMemory } from '../memory/projectMemory';
import { NanoOrchestrator } from './nanoOrchestrator';
import { ConsensusSynthesizer } from './synthesizer';
import { Settings } from '../settings/settings';
import { LocalModelSynthesizer } from './localModelSynthesizer';
import { EmbeddedLlm } from '../llm/embeddedLlm';

export type { CouncilMode };

export interface CouncilRunOptions {
  /** If true, run the NanoOrchestrator "architect" pre-pass to shape prompts & contracts. */
  architect?: boolean;
  /** If true, include per-project shared memory context and write back council results. */
  memory?: boolean;
  /** If true, require a synthesis/consensus response. If false, return raw council outputs. */
  consensus?: boolean;
  /** If true, use a reduced/fast council (fewer members) to lower latency. */
  fast?: boolean;
}

export class CouncilOrchestrator {
  private readonly settings: Settings;
  private readonly runner: WslCliRunner;
  private readonly nano: NanoOrchestrator;
  private readonly synth: ConsensusSynthesizer;
  private readonly localModel: LocalModelSynthesizer;
  private embeddedLlm: EmbeddedLlm | null = null;
  private disposed = false;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly memory: ProjectMemory
  ) {
    this.settings = new Settings();
    this.runner = new WslCliRunner(this.output, this.settings);
    this.nano = new NanoOrchestrator(this.output);
    this.synth = new ConsensusSynthesizer(this.output);
    this.localModel = new LocalModelSynthesizer(this.output);
  }

  /**
   * Get the settings instance (for webview to read engine info).
   */
  public getSettings(): Settings {
    return this.settings;
  }

  /**
   * Get or create the embedded LLM instance (lazy initialization).
   */
  private getEmbeddedLlm(): EmbeddedLlm | null {
    if (!this.settings.embeddedEnabled()) {
      return null;
    }

    if (!this.embeddedLlm) {
      const modelId = this.settings.embeddedModelId();
      this.embeddedLlm = new EmbeddedLlm(modelId, this.output);
    }

    return this.embeddedLlm;
  }

  /**
   * Dispose of the embedded LLM and free resources.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.embeddedLlm) {
      this.embeddedLlm.dispose();
      this.embeddedLlm = null;
    }
  }

  public async runSetupWizard(): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      vscode.window.showWarningMessage('Open a folder/workspace first.');
      return;
    }

    const items: Array<{ label: string; detail: string; cli: 'codex'|'claude'|'gemini' }> = [
      { label: 'Codex CLI OAuth / Login', detail: 'Runs codex in a VS Code terminal (WSL) so you can authenticate.', cli: 'codex' },
      { label: 'Claude Code OAuth / Login', detail: 'Runs claude in a VS Code terminal (WSL) so you can authenticate.', cli: 'claude' },
      { label: 'Gemini CLI OAuth / Login', detail: 'Runs gemini in a VS Code terminal (WSL) so you can authenticate.', cli: 'gemini' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
      title: 'Unified AI Council: One-time OAuth setup',
      placeHolder: 'Pick which CLI to authenticate',
      canPickMany: false
    });

    if (!pick) return;
    await this.runner.openInteractiveSetupTerminal(pick.cli);
  }

  public async runCouncil(userText: string, mode: CouncilMode, opts: CouncilRunOptions = {}): Promise<string> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return 'Open a workspace folder first.';

    const profile = MODE_PROFILES[mode] ?? MODE_PROFILES.plan;
    const useArchitect = opts.architect ?? true;
    const useMemory = opts.memory ?? true;
    const requireConsensus = opts.consensus ?? true;
    const fast = opts.fast ?? false;

    const memoryContext = useMemory ? await this.memory.buildContextForPrompt(userText) : '';
    const fileContext = useMemory ? await this.memory.captureWorkspaceSnapshotHints(ws.uri) : '';

    const fallbackResponseContract = this.buildResponseContractString(profile);
    const engine = this.settings.orchestratorEngine();
    const embeddedLlm = this.getEmbeddedLlm();

    // Build council prompt - use LLM pre-pass if embedded engine is enabled
    let councilPrompt: string;
    let responseContract: string;

    if (useArchitect) {
      if (engine === 'embedded' && embeddedLlm) {
        try {
          const maxTokens = this.settings.embeddedMaxTokens();
          const result = await this.nano.buildCouncilPromptWithLlm(
            {
              userText,
              mode: profile.name,
              councilGoal: profile.councilGoal,
              memoryContext,
              fileContext
            },
            embeddedLlm,
            maxTokens
          );
          councilPrompt = result.councilPrompt;
          responseContract = result.responseContract;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.output.appendLine(`[orchestrator] Embedded LLM pre-pass failed, using heuristic: ${errMsg}`);
          const result = this.nano.buildCouncilPrompt({
            userText,
            mode: profile.name,
            councilGoal: profile.councilGoal,
            memoryContext,
            fileContext
          });
          councilPrompt = result.councilPrompt;
          responseContract = result.responseContract;
        }
      } else {
        const result = this.nano.buildCouncilPrompt({
          userText,
          mode: profile.name,
          councilGoal: profile.councilGoal,
          memoryContext,
          fileContext
        });
        councilPrompt = result.councilPrompt;
        responseContract = result.responseContract;
      }
    } else {
      councilPrompt = `${profile.councilGoal}\n\nUSER:\n${userText}\n\nRespond with the best possible answer for this mode.`;
      responseContract = fallbackResponseContract;
    }

    const timeoutMs = this.settings.cliTimeoutMs();

    const jobs: Array<Promise<string>> = [
      this.runner.runCouncilMember('codex', profile.roles.codex, councilPrompt, timeoutMs),
      this.runner.runCouncilMember('claude', profile.roles.claude, councilPrompt, timeoutMs)
    ];
    if (!fast) {
      jobs.push(this.runner.runCouncilMember('gemini', profile.roles.gemini, councilPrompt, timeoutMs));
    }
    const results = await Promise.allSettled(jobs);
    const codex = results[0];
    const claude = results[1];
    const gemini = results[2];

    const codexText = codex.status === 'fulfilled' ? codex.value : `ERROR: ${String(codex.reason)}`;
    const claudeText = claude.status === 'fulfilled' ? claude.value : `ERROR: ${String(claude.reason)}`;
    const geminiText = gemini
      ? (gemini.status === 'fulfilled' ? gemini.value : `ERROR: ${String(gemini.reason)}`)
      : '[skipped]';

    if (!requireConsensus) {
      const header = `Unified AI Council (raw outputs) — mode: ${profile.name}`;
      return `${header}\n\n---\n\n### Codex\n${codexText}\n\n---\n\n### Claude Code\n${claudeText}\n\n---\n\n### Gemini\n${geminiText}`;
    }

    const synthesisInput = {
      mode: profile.name,
      rubric: profile.synthesis.rubric,
      outputStyle: profile.synthesis.outputStyle,
      responseContract,
      userText,
      council: { codex: codexText, claude: claudeText, gemini: geminiText }
    };

    // Synthesize final response based on engine
    let final: string;

    if (engine === 'embedded' && embeddedLlm) {
      // Use embedded LLM for synthesis
      try {
        const maxTokens = this.settings.embeddedMaxTokens();
        final = await this.synth.synthesizeWithLlm(synthesisInput, embeddedLlm, maxTokens);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.output.appendLine(`[orchestrator] Embedded synthesis failed, using heuristic: ${errMsg}`);
        final = this.synth.synthesize(synthesisInput);
      }
    } else if (engine === 'ollama') {
      // Use Ollama for synthesis
      try {
        const cfg = this.settings.ollamaConfig();
        const councilNotes = `Codex:\n${codexText}\n\nClaude Code:\n${claudeText}\n\nGemini:\n${geminiText}`;
        const prompt = [
          `Mode: ${profile.name}`,
          `Council goal: ${profile.councilGoal}`,
          '',
          'User request:',
          userText.trim(),
          '',
          memoryContext ? 'Project memory:' : '',
          memoryContext ? memoryContext.trim() : '',
          '',
          fileContext ? 'Workspace hints:' : '',
          fileContext ? fileContext.trim() : ''
        ].filter(Boolean).join('\n');
        final = await this.localModel.synthesizeWithOllama(
          cfg,
          {
            mode: profile.name,
            prompt,
            responseContract,
            councilNotes
          },
        );
      } catch (e) {
        this.output.appendLine(`[orchestrator] Ollama synthesis failed; falling back. ${String(e)}`);
        final = this.synth.synthesize(synthesisInput);
      }
    } else {
      // Use heuristic synthesis (nano engine)
      final = this.synth.synthesize(synthesisInput);
    }

    if (useMemory) {
      await this.memory.addEntry({
        kind: 'council',
        userText,
        mode,
        final,
        council: { codex: codexText, claude: claudeText, gemini: geminiText }
      });
    }

    return final;
  }

  private buildResponseContractString(profile: ModeProfile): string {
    const required = profile.synthesis.requiredSections?.length
      ? `Required sections (in order):\n- ${profile.synthesis.requiredSections.join('\n- ')}`
      : 'No required sections.';

    const banned = profile.synthesis.bannedContent?.length
      ? `Banned content:\n- ${profile.synthesis.bannedContent.join('\n- ')}`
      : 'No explicit banned content.';

    const style = profile.synthesis.outputStyle?.trim() ? `Style: ${profile.synthesis.outputStyle.trim()}` : 'Style: (unspecified)';

    return [
      'RESPONSE CONTRACT',
      required,
      banned,
      style,
      'Keep answers concrete: file paths, commands, and step-by-step instructions when relevant.'
    ].join('\n\n');
  }
}
