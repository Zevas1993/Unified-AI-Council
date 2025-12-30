import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    getConfiguration: vi.fn(() => ({
      get: vi.fn()
    }))
  },
  window: {
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
    createTerminal: vi.fn(() => ({ show: vi.fn() }))
  }
}));

// Mock dependencies
vi.mock('../cli/wslCliRunner', () => ({
  WslCliRunner: vi.fn().mockImplementation(() => ({
    runCouncilMember: vi.fn(),
    openInteractiveSetupTerminal: vi.fn()
  }))
}));

vi.mock('../memory/projectMemory', () => ({
  ProjectMemory: vi.fn().mockImplementation(() => ({
    buildContextForPrompt: vi.fn().mockResolvedValue('mock memory context'),
    captureWorkspaceSnapshotHints: vi.fn().mockResolvedValue('mock file context'),
    addEntry: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('./nanoOrchestrator', () => ({
  NanoOrchestrator: vi.fn().mockImplementation(() => ({
    buildCouncilPrompt: vi.fn(() => ({
      councilPrompt: 'mock council prompt',
      responseContract: 'mock response contract'
    })),
    buildCouncilPromptWithLlm: vi.fn()
  }))
}));

vi.mock('./synthesizer', () => ({
  ConsensusSynthesizer: vi.fn().mockImplementation(() => ({
    synthesize: vi.fn(() => 'Synthesized result'),
    synthesizeWithLlm: vi.fn()
  }))
}));

vi.mock('./localModelSynthesizer', () => ({
  LocalModelSynthesizer: vi.fn().mockImplementation(() => ({
    synthesizeWithOllama: vi.fn()
  }))
}));

vi.mock('../settings/settings', () => ({
  Settings: vi.fn().mockImplementation(() => ({
    wslDistro: vi.fn(() => ''),
    wslShell: vi.fn(() => 'bash'),
    cliTimeoutMs: vi.fn(() => 180000),
    orchestratorEngine: vi.fn(() => 'nano'),
    embeddedEnabled: vi.fn(() => false),
    embeddedModelId: vi.fn(() => 'test-model'),
    embeddedMaxTokens: vi.fn(() => 256),
    ollamaConfig: vi.fn(() => ({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2:3b',
      temperature: 0.2,
      topP: 0.95,
      maxTokens: 900
    })),
    codexCommand: vi.fn(() => ({ cmd: 'codex' })),
    claudeCommand: vi.fn(() => ({ cmd: 'claude' })),
    geminiCommand: vi.fn(() => ({ cmd: 'gemini' }))
  }))
}));

vi.mock('../llm/embeddedLlm', () => ({
  EmbeddedLlm: vi.fn().mockImplementation(() => ({
    generate: vi.fn(),
    dispose: vi.fn()
  }))
}));

import * as vscode from 'vscode';
import { CouncilOrchestrator } from './orchestrator';
import { ProjectMemory } from '../memory/projectMemory';
import { WslCliRunner } from '../cli/wslCliRunner';

describe('CouncilOrchestrator', () => {
  let orchestrator: CouncilOrchestrator;
  let mockOutput: vscode.OutputChannel;
  let mockMemory: ProjectMemory;
  let appendedLines: string[];

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;

    mockMemory = new ProjectMemory(mockOutput);
    orchestrator = new CouncilOrchestrator(mockOutput, mockMemory);
  });

  afterEach(() => {
    orchestrator.dispose();
    vi.clearAllMocks();
  });

  describe('runSetupWizard', () => {
    it('shows warning when no workspace folder is open', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      await orchestrator.runSetupWizard();

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        'Open a folder/workspace first.'
      );
    });

    it('shows quick pick with CLI options', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      await orchestrator.runSetupWizard();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ cli: 'codex' }),
          expect.objectContaining({ cli: 'claude' }),
          expect.objectContaining({ cli: 'gemini' })
        ]),
        expect.any(Object)
      );
    });

    it('opens terminal for selected CLI', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: 'Codex',
        detail: 'Test',
        cli: 'codex'
      } as any);

      await orchestrator.runSetupWizard();

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      expect(runner.openInteractiveSetupTerminal).toHaveBeenCalledWith('codex');
    });
  });

  describe('runCouncil', () => {
    it('returns message when no workspace folder is open', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = undefined;

      const result = await orchestrator.runCouncil('test', 'plan');

      expect(result).toBe('Open a workspace folder first.');
    });

    it('runs all three council members by default', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex response')
        .mockResolvedValueOnce('Claude response')
        .mockResolvedValueOnce('Gemini response');

      await orchestrator.runCouncil('test prompt', 'plan');

      expect(runner.runCouncilMember).toHaveBeenCalledTimes(3);
      expect(runner.runCouncilMember).toHaveBeenCalledWith(
        'codex',
        expect.any(Object),
        expect.any(String),
        expect.any(Number)
      );
      expect(runner.runCouncilMember).toHaveBeenCalledWith(
        'claude',
        expect.any(Object),
        expect.any(String),
        expect.any(Number)
      );
      expect(runner.runCouncilMember).toHaveBeenCalledWith(
        'gemini',
        expect.any(Object),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('skips gemini in fast mode', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex response')
        .mockResolvedValueOnce('Claude response');

      await orchestrator.runCouncil('test prompt', 'plan', { fast: true });

      expect(runner.runCouncilMember).toHaveBeenCalledTimes(2);
      expect(runner.runCouncilMember).not.toHaveBeenCalledWith(
        'gemini',
        expect.any(Object),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('returns raw outputs when consensus is disabled', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex response')
        .mockResolvedValueOnce('Claude response')
        .mockResolvedValueOnce('Gemini response');

      const result = await orchestrator.runCouncil('test', 'plan', { consensus: false });

      expect(result).toContain('raw outputs');
      expect(result).toContain('### Codex');
      expect(result).toContain('Codex response');
      expect(result).toContain('### Claude Code');
      expect(result).toContain('Claude response');
      expect(result).toContain('### Gemini');
      expect(result).toContain('Gemini response');
    });

    it('handles council member failures gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex response')
        .mockRejectedValueOnce(new Error('Claude timeout'))
        .mockResolvedValueOnce('Gemini response');

      const result = await orchestrator.runCouncil('test', 'plan', { consensus: false });

      expect(result).toContain('Codex response');
      expect(result).toContain('ERROR:');
      expect(result).toContain('Claude timeout');
      expect(result).toContain('Gemini response');
    });

    it('saves to memory when memory option is enabled', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex')
        .mockResolvedValueOnce('Claude')
        .mockResolvedValueOnce('Gemini');

      await orchestrator.runCouncil('test prompt', 'plan', { memory: true });

      expect(mockMemory.addEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'council',
          mode: 'plan',
          userText: 'test prompt'
        })
      );
    });

    it('does not save to memory when memory option is disabled', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember
        .mockResolvedValueOnce('Codex')
        .mockResolvedValueOnce('Claude')
        .mockResolvedValueOnce('Gemini');

      await orchestrator.runCouncil('test prompt', 'plan', { memory: false });

      expect(mockMemory.addEntry).not.toHaveBeenCalled();
    });

    it('uses correct mode profile', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember.mockResolvedValue('response');

      await orchestrator.runCouncil('debug this code', 'debug');

      // Check that the mode was passed correctly to memory
      expect(mockMemory.addEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'debug'
        })
      );
    });

    it('defaults to plan mode for unknown modes', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/test' } }] as any;

      const runner = vi.mocked(WslCliRunner).mock.results[0].value;
      runner.runCouncilMember.mockResolvedValue('response');

      // Pass invalid mode - should fall back to plan
      await orchestrator.runCouncil('test', 'invalid-mode' as any);

      // Should not throw and should complete
      expect(runner.runCouncilMember).toHaveBeenCalled();
    });
  });

  describe('getSettings', () => {
    it('returns the settings instance', () => {
      const settings = orchestrator.getSettings();

      expect(settings).toBeDefined();
      expect(settings.orchestratorEngine).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('can be called multiple times safely', () => {
      expect(() => {
        orchestrator.dispose();
        orchestrator.dispose();
      }).not.toThrow();
    });
  });
});
