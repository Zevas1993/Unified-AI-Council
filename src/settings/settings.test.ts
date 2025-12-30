import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn()
  }
}));

// Mock commandValidation
vi.mock('../security/commandValidation', () => ({
  validateCliCommand: vi.fn((cmd: string) => {
    if (cmd === 'codex' || cmd === 'claude' || cmd === 'gemini') {
      return { ok: true, normalized: cmd };
    }
    if (cmd.includes(';') || cmd.includes('|')) {
      return { ok: false, reason: 'Invalid characters' };
    }
    return { ok: true, normalized: cmd };
  })
}));

import * as vscode from 'vscode';
import { Settings } from './settings';

describe('Settings', () => {
  let settings: Settings;
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGet = vi.fn();
    (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({
      get: mockGet
    });
    settings = new Settings();
  });

  describe('wslDistro', () => {
    it('returns empty string when not configured', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.wslDistro()).toBe('');
    });

    it('returns configured distro', () => {
      mockGet.mockReturnValue('Ubuntu');
      expect(settings.wslDistro()).toBe('Ubuntu');
    });

    it('trims whitespace', () => {
      mockGet.mockReturnValue('  Ubuntu  ');
      expect(settings.wslDistro()).toBe('Ubuntu');
    });
  });

  describe('wslShell', () => {
    it('returns bash as default', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.wslShell()).toBe('bash');
    });

    it('returns configured shell', () => {
      mockGet.mockReturnValue('zsh');
      expect(settings.wslShell()).toBe('zsh');
    });

    it('falls back to bash for empty string', () => {
      mockGet.mockReturnValue('');
      expect(settings.wslShell()).toBe('bash');
    });
  });

  describe('CLI commands', () => {
    it('codexCommand returns default codex', () => {
      mockGet.mockReturnValue(undefined);
      const result = settings.codexCommand();
      expect(result.cmd).toBe('codex');
      expect(result.error).toBeUndefined();
    });

    it('claudeCommand returns default claude', () => {
      mockGet.mockReturnValue(undefined);
      const result = settings.claudeCommand();
      expect(result.cmd).toBe('claude');
      expect(result.error).toBeUndefined();
    });

    it('geminiCommand returns default gemini', () => {
      mockGet.mockReturnValue(undefined);
      const result = settings.geminiCommand();
      expect(result.cmd).toBe('gemini');
      expect(result.error).toBeUndefined();
    });

    it('returns error for invalid command', () => {
      mockGet.mockReturnValue('codex; rm -rf /');
      const result = settings.codexCommand();
      expect(result.error).toBeDefined();
    });
  });

  describe('cliTimeoutMs', () => {
    it('returns default 180000ms', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.cliTimeoutMs()).toBe(180000);
    });

    it('returns configured timeout', () => {
      mockGet.mockReturnValue(300000);
      expect(settings.cliTimeoutMs()).toBe(300000);
    });

    it('rejects values below 5000ms', () => {
      mockGet.mockReturnValue(1000);
      expect(settings.cliTimeoutMs()).toBe(180000);
    });

    it('rejects non-finite values', () => {
      mockGet.mockReturnValue(NaN);
      expect(settings.cliTimeoutMs()).toBe(180000);
    });
  });

  describe('maxContextChars', () => {
    it('returns default 14000', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.maxContextChars()).toBe(14000);
    });

    it('rejects values below 1000', () => {
      mockGet.mockReturnValue(500);
      expect(settings.maxContextChars()).toBe(14000);
    });
  });

  describe('memoryMaxEntries', () => {
    it('returns default 500', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.memoryMaxEntries()).toBe(500);
    });

    it('returns configured value', () => {
      mockGet.mockReturnValue(1000);
      expect(settings.memoryMaxEntries()).toBe(1000);
    });

    it('rejects values below 10', () => {
      mockGet.mockReturnValue(5);
      expect(settings.memoryMaxEntries()).toBe(500);
    });
  });

  describe('orchestratorEngine', () => {
    it('returns embedded as default', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.orchestratorEngine()).toBe('embedded');
    });

    it('returns ollama when configured', () => {
      mockGet.mockReturnValue('ollama');
      expect(settings.orchestratorEngine()).toBe('ollama');
    });

    it('returns nano when configured', () => {
      mockGet.mockReturnValue('nano');
      expect(settings.orchestratorEngine()).toBe('nano');
    });

    it('returns embedded for invalid values', () => {
      mockGet.mockReturnValue('invalid');
      expect(settings.orchestratorEngine()).toBe('embedded');
    });
  });

  describe('embedded LLM settings', () => {
    it('embeddedEnabled returns true by default', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.embeddedEnabled()).toBe(true);
    });

    it('embeddedEnabled returns configured value', () => {
      mockGet.mockReturnValue(false);
      expect(settings.embeddedEnabled()).toBe(false);
    });

    it('embeddedModelId returns default model', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.embeddedModelId()).toBe('onnx-community/Qwen2.5-Coder-0.5B-Instruct');
    });

    it('embeddedModelId returns configured model', () => {
      mockGet.mockReturnValue('custom/model');
      expect(settings.embeddedModelId()).toBe('custom/model');
    });

    it('embeddedMaxTokens returns default 256', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.embeddedMaxTokens()).toBe(256);
    });

    it('embeddedMaxTokens rejects values below 10', () => {
      mockGet.mockReturnValue(5);
      expect(settings.embeddedMaxTokens()).toBe(256);
    });

    it('embeddedTemperature returns default 0.3', () => {
      mockGet.mockReturnValue(undefined);
      expect(settings.embeddedTemperature()).toBe(0.3);
    });

    it('embeddedTemperature rejects values outside 0-2 range', () => {
      mockGet.mockReturnValue(3);
      expect(settings.embeddedTemperature()).toBe(0.3);
    });
  });

  describe('ollamaConfig', () => {
    it('returns defaults when not configured', () => {
      mockGet.mockReturnValue(undefined);
      const config = settings.ollamaConfig();
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.model).toBe('llama3.2:3b');
      expect(config.temperature).toBe(0.2);
      expect(config.topP).toBe(0.95);
      expect(config.maxTokens).toBe(900);
    });

    it('returns configured values', () => {
      mockGet.mockImplementation((key: string) => {
        const values: Record<string, unknown> = {
          'orchestrator.ollama.baseUrl': 'http://myhost:8080',
          'orchestrator.ollama.model': 'mistral:7b',
          'orchestrator.ollama.temperature': 0.5,
          'orchestrator.ollama.topP': 0.8,
          'orchestrator.ollama.maxTokens': 1500
        };
        return values[key];
      });
      const config = settings.ollamaConfig();
      expect(config.baseUrl).toBe('http://myhost:8080');
      expect(config.model).toBe('mistral:7b');
      expect(config.temperature).toBe(0.5);
      expect(config.topP).toBe(0.8);
      expect(config.maxTokens).toBe(1500);
    });
  });
});
