import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

// Mock @huggingface/transformers
const mockPipeline = vi.fn();
vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args)
}));

import { EmbeddedLlm } from './embeddedLlm';
import type * as vscode from 'vscode';

describe('EmbeddedLlm', () => {
  let llm: EmbeddedLlm;
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;

    mockPipeline.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates instance with model ID', () => {
      llm = new EmbeddedLlm('test-model', mockOutput);

      expect(llm.isLoaded()).toBe(false);
      expect(llm.hasError()).toBe(false);
    });
  });

  describe('isLoaded', () => {
    it('returns false initially', () => {
      llm = new EmbeddedLlm('test-model', mockOutput);

      expect(llm.isLoaded()).toBe(false);
    });

    it('returns true after successful load', async () => {
      const mockGenerator = vi.fn();
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.ensureLoaded();

      expect(llm.isLoaded()).toBe(true);
    });
  });

  describe('hasError', () => {
    it('returns false initially', () => {
      llm = new EmbeddedLlm('test-model', mockOutput);

      expect(llm.hasError()).toBe(false);
    });

    it('returns true after load failure', async () => {
      mockPipeline.mockRejectedValue(new Error('Load failed'));

      llm = new EmbeddedLlm('test-model', mockOutput);

      await expect(llm.ensureLoaded()).rejects.toThrow('Load failed');
      expect(llm.hasError()).toBe(true);
    });
  });

  describe('getError', () => {
    it('returns null when no error', () => {
      llm = new EmbeddedLlm('test-model', mockOutput);

      expect(llm.getError()).toBeNull();
    });

    it('returns error after load failure', async () => {
      mockPipeline.mockRejectedValue(new Error('Model not found'));

      llm = new EmbeddedLlm('test-model', mockOutput);

      await expect(llm.ensureLoaded()).rejects.toThrow();
      expect(llm.getError()?.message).toBe('Model not found');
    });
  });

  describe('ensureLoaded', () => {
    it('loads model on first call', async () => {
      const mockGenerator = vi.fn();
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('onnx-community/test-model', mockOutput);
      await llm.ensureLoaded();

      expect(mockPipeline).toHaveBeenCalledWith(
        'text-generation',
        'onnx-community/test-model',
        expect.objectContaining({
          dtype: 'q4f16',
          device: 'cpu'
        })
      );
      expect(appendedLines.some(l => l.includes('Loading model'))).toBe(true);
      expect(appendedLines.some(l => l.includes('loaded successfully'))).toBe(true);
    });

    it('reuses existing load promise', async () => {
      const mockGenerator = vi.fn();
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);

      // Call twice concurrently
      const [result1, result2] = await Promise.all([
        llm.ensureLoaded(),
        llm.ensureLoaded()
      ]);

      // Should only load once
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('throws cached error on subsequent calls', async () => {
      mockPipeline.mockRejectedValue(new Error('Network error'));

      llm = new EmbeddedLlm('test-model', mockOutput);

      await expect(llm.ensureLoaded()).rejects.toThrow('Network error');
      await expect(llm.ensureLoaded()).rejects.toThrow('Network error');

      // Should only attempt to load once
      expect(mockPipeline).toHaveBeenCalledTimes(1);
    });

    it('returns immediately if already loaded', async () => {
      const mockGenerator = vi.fn();
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.ensureLoaded();

      mockPipeline.mockClear();
      await llm.ensureLoaded();

      expect(mockPipeline).not.toHaveBeenCalled();
    });
  });

  describe('generate', () => {
    it('generates text with default options', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: '  Generated response  ' }
      ]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      const result = await llm.generate('Test prompt');

      expect(result).toBe('Generated response');
      expect(mockGenerator).toHaveBeenCalledWith('Test prompt', {
        max_new_tokens: 256,
        temperature: 0.3,
        do_sample: true,
        return_full_text: false
      });
    });

    it('uses custom options', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: 'Response' }
      ]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.generate('Test', { maxTokens: 512, temperature: 0.7 });

      expect(mockGenerator).toHaveBeenCalledWith('Test', {
        max_new_tokens: 512,
        temperature: 0.7,
        do_sample: true,
        return_full_text: false
      });
    });

    it('disables sampling when temperature is 0', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: 'Response' }
      ]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.generate('Test', { temperature: 0 });

      expect(mockGenerator).toHaveBeenCalledWith('Test', expect.objectContaining({
        do_sample: false
      }));
    });

    it('handles empty response', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: '' }
      ]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      const result = await llm.generate('Test');

      expect(result).toBe('');
    });

    it('handles missing generated_text', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([{}]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      const result = await llm.generate('Test');

      expect(result).toBe('');
    });

    it('throws on generation error', async () => {
      const mockGenerator = vi.fn().mockRejectedValue(new Error('Generation failed'));
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);

      await expect(llm.generate('Test')).rejects.toThrow('Generation failed');
      expect(appendedLines.some(l => l.includes('Generation failed'))).toBe(true);
    });

    it('logs generated character count', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: 'Hello world' }
      ]);
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.generate('Test');

      expect(appendedLines.some(l => l.includes('Generated 11 chars'))).toBe(true);
    });
  });

  describe('dispose', () => {
    it('clears generator and state', async () => {
      const mockGenerator = vi.fn();
      mockPipeline.mockResolvedValue(mockGenerator);

      llm = new EmbeddedLlm('test-model', mockOutput);
      await llm.ensureLoaded();

      expect(llm.isLoaded()).toBe(true);

      llm.dispose();

      expect(llm.isLoaded()).toBe(false);
      expect(appendedLines.some(l => l.includes('disposed'))).toBe(true);
    });

    it('can be called multiple times safely', () => {
      llm = new EmbeddedLlm('test-model', mockOutput);

      expect(() => {
        llm.dispose();
        llm.dispose();
      }).not.toThrow();
    });

    it('clears error state', async () => {
      mockPipeline.mockRejectedValue(new Error('Load error'));

      llm = new EmbeddedLlm('test-model', mockOutput);
      await expect(llm.ensureLoaded()).rejects.toThrow();

      expect(llm.hasError()).toBe(true);

      llm.dispose();

      expect(llm.hasError()).toBe(false);
      expect(llm.getError()).toBeNull();
    });
  });
});
