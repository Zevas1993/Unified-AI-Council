import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { LocalModelSynthesizer, OllamaConfig, SynthesisInput } from './localModelSynthesizer';
import type * as vscode from 'vscode';

describe('LocalModelSynthesizer', () => {
  let synth: LocalModelSynthesizer;
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];

  const defaultConfig: OllamaConfig = {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2:3b',
    temperature: 0.2,
    top_p: 0.95,
    maxTokens: 900
  };

  const defaultInput: SynthesisInput = {
    mode: 'plan',
    prompt: 'Help me plan a feature',
    responseContract: 'Be concrete and specific',
    councilNotes: 'Codex: suggestion A\nClaude: suggestion B'
  };

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;

    synth = new LocalModelSynthesizer(mockOutput);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('synthesizeWithOllama', () => {
    it('makes POST request to Ollama API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Synthesized result', done: true })
      });

      await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' }
        })
      );
    });

    it('includes model and prompt in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.model).toBe('llama3.2:3b');
      expect(body.prompt).toContain('MODE: plan');
      expect(body.prompt).toContain('Help me plan a feature');
      expect(body.prompt).toContain('Codex: suggestion A');
      expect(body.stream).toBe(false);
    });

    it('includes optional config in options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.options.temperature).toBe(0.2);
      expect(body.options.top_p).toBe(0.95);
      expect(body.options.num_predict).toBe(900);
    });

    it('omits undefined config options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      const minimalConfig: OllamaConfig = {
        baseUrl: 'http://localhost:11434',
        model: 'test-model'
      };

      await synth.synthesizeWithOllama(minimalConfig, defaultInput);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.options).toEqual({});
    });

    it('returns trimmed response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: '  Synthesized result  ' })
      });

      const result = await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      expect(result).toBe('Synthesized result');
    });

    it('normalizes base URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      const config: OllamaConfig = {
        baseUrl: 'http://localhost:11434///',
        model: 'test'
      };

      await synth.synthesizeWithOllama(config, defaultInput);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.any(Object)
      );
    });

    it('uses default base URL for empty string', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      const config: OllamaConfig = {
        baseUrl: '',
        model: 'test'
      };

      await synth.synthesizeWithOllama(config, defaultInput);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/generate',
        expect.any(Object)
      );
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error details')
      });

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama /api/generate failed: HTTP 500 Internal Server Error - Server error details');
    });

    it('throws on Ollama error response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'Model not found' })
      });

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama error: Model not found');
    });

    it('throws on empty response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: '' })
      });

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama returned an empty response');
    });

    it('throws on missing response field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ done: true })
      });

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama returned an empty response');
    });

    it('logs request details', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      expect(appendedLines.some(l =>
        l.includes('Ollama synth request') &&
        l.includes('localhost:11434') &&
        l.includes('llama3.2:3b')
      )).toBe(true);
    });

    it('handles fetch network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network unreachable'));

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Network unreachable');
    });

    it('includes AbortSignal for timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      await synth.synthesizeWithOllama(defaultConfig, defaultInput);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });

    it('throws timeout error on abort', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama request timed out after 30s');
    });

    it('handles error reading response body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.reject(new Error('Read failed'))
      });

      await expect(
        synth.synthesizeWithOllama(defaultConfig, defaultInput)
      ).rejects.toThrow('Ollama /api/generate failed: HTTP 500 Error');

      expect(appendedLines.some(l => l.includes('Failed to read error response body'))).toBe(true);
    });

    it('rejects non-http/https protocols and uses default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      const config: OllamaConfig = {
        baseUrl: 'file:///etc/passwd',
        model: 'test'
      };

      await synth.synthesizeWithOllama(config, defaultInput);

      // Should use default URL, not the file:// URL
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/generate',
        expect.any(Object)
      );
      expect(appendedLines.some(l => l.includes('URL validation warning'))).toBe(true);
    });

    it('rejects invalid URL format and uses default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' })
      });

      const config: OllamaConfig = {
        baseUrl: 'not-a-valid-url',
        model: 'test'
      };

      await synth.synthesizeWithOllama(config, defaultInput);

      // Should use default URL
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/generate',
        expect.any(Object)
      );
      expect(appendedLines.some(l => l.includes('Invalid URL format'))).toBe(true);
    });
  });
});
