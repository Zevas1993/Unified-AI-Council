import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

import { NanoOrchestrator, BuildInput } from './nanoOrchestrator';
import { EmbeddedLlm } from '../llm/embeddedLlm';
import type * as vscode from 'vscode';

describe('NanoOrchestrator', () => {
  let nano: NanoOrchestrator;
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;

    nano = new NanoOrchestrator(mockOutput);
  });

  describe('buildCouncilPrompt', () => {
    it('builds prompt with all input fields', () => {
      const input: BuildInput = {
        userText: 'Help me implement authentication',
        mode: 'plan',
        councilGoal: 'Create an architecture plan',
        memoryContext: 'Previous: used JWT tokens',
        fileContext: 'file: src/auth.ts'
      };

      const result = nano.buildCouncilPrompt(input);

      expect(result.councilPrompt).toContain('MODE: PLAN');
      expect(result.councilPrompt).toContain('Create an architecture plan');
      expect(result.councilPrompt).toContain('Help me implement authentication');
      expect(result.councilPrompt).toContain('Previous: used JWT tokens');
      expect(result.councilPrompt).toContain('file: src/auth.ts');
    });

    it('includes response contract', () => {
      const input: BuildInput = {
        userText: 'Test',
        mode: 'debug',
        councilGoal: 'Find bugs',
        memoryContext: '',
        fileContext: ''
      };

      const result = nano.buildCouncilPrompt(input);

      expect(result.responseContract).toContain('RESPONSE CONTRACT');
      expect(result.responseContract).toContain('Be concrete');
      expect(result.councilPrompt).toContain('RESPONSE CONTRACT');
    });

    it('logs heuristic prompt creation', () => {
      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: '',
        fileContext: ''
      };

      nano.buildCouncilPrompt(input);

      expect(appendedLines.some(l => l.includes('[nano] built council prompt (heuristic)'))).toBe(true);
    });

    it('handles empty memory context', () => {
      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: '',
        fileContext: 'file: test.ts'
      };

      const result = nano.buildCouncilPrompt(input);

      expect(result.councilPrompt).toContain('PROJECT MEMORY:');
      expect(result.councilPrompt).toContain('WORKSPACE HINTS:');
    });

    it('handles empty file context', () => {
      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: 'Memory content',
        fileContext: ''
      };

      const result = nano.buildCouncilPrompt(input);

      expect(result.councilPrompt).toContain('Memory content');
    });

    it('uppercases mode in prompt', () => {
      const input: BuildInput = {
        userText: 'Test',
        mode: 'refactor',
        councilGoal: 'Refactor code',
        memoryContext: '',
        fileContext: ''
      };

      const result = nano.buildCouncilPrompt(input);

      expect(result.councilPrompt).toContain('MODE: REFACTOR');
    });
  });

  describe('buildCouncilPromptWithLlm', () => {
    let mockLlm: EmbeddedLlm;

    beforeEach(() => {
      mockLlm = {
        generate: vi.fn()
      } as unknown as EmbeddedLlm;
    });

    it('uses LLM to optimize prompt', async () => {
      vi.mocked(mockLlm.generate).mockResolvedValue('Optimized task description');

      const input: BuildInput = {
        userText: 'Help me with auth',
        mode: 'plan',
        councilGoal: 'Create plan',
        memoryContext: '',
        fileContext: ''
      };

      const result = await nano.buildCouncilPromptWithLlm(input, mockLlm);

      expect(mockLlm.generate).toHaveBeenCalledWith(
        expect.stringContaining('prompt engineer'),
        expect.objectContaining({ maxTokens: 150 })
      );
      expect(result.councilPrompt).toContain('Optimized task description');
    });

    it('falls back to original text on LLM failure', async () => {
      vi.mocked(mockLlm.generate).mockRejectedValue(new Error('LLM error'));

      const input: BuildInput = {
        userText: 'Original user request',
        mode: 'debug',
        councilGoal: 'Debug',
        memoryContext: '',
        fileContext: ''
      };

      const result = await nano.buildCouncilPromptWithLlm(input, mockLlm);

      expect(result.councilPrompt).toContain('Original user request');
      expect(appendedLines.some(l => l.includes('LLM pre-pass failed'))).toBe(true);
    });

    it('uses custom maxTokens', async () => {
      vi.mocked(mockLlm.generate).mockResolvedValue('Response');

      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: '',
        fileContext: ''
      };

      await nano.buildCouncilPromptWithLlm(input, mockLlm, 300);

      expect(mockLlm.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxTokens: 300 })
      );
    });

    it('logs LLM-enhanced prompt creation', async () => {
      vi.mocked(mockLlm.generate).mockResolvedValue('Optimized');

      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: '',
        fileContext: ''
      };

      await nano.buildCouncilPromptWithLlm(input, mockLlm);

      expect(appendedLines.some(l => l.includes('[nano] LLM pre-pass completed'))).toBe(true);
      expect(appendedLines.some(l => l.includes('[nano] built council prompt (LLM-enhanced)'))).toBe(true);
    });

    it('includes mode and goal in pre-pass prompt', async () => {
      vi.mocked(mockLlm.generate).mockResolvedValue('Response');

      const input: BuildInput = {
        userText: 'Test request',
        mode: 'refactor',
        councilGoal: 'Improve code quality',
        memoryContext: '',
        fileContext: ''
      };

      await nano.buildCouncilPromptWithLlm(input, mockLlm);

      const prePassPrompt = vi.mocked(mockLlm.generate).mock.calls[0][0];
      expect(prePassPrompt).toContain('Mode: refactor');
      expect(prePassPrompt).toContain('Goal: Improve code quality');
      expect(prePassPrompt).toContain('User request: Test request');
    });

    it('includes response contract in result', async () => {
      vi.mocked(mockLlm.generate).mockResolvedValue('Response');

      const input: BuildInput = {
        userText: 'Test',
        mode: 'plan',
        councilGoal: 'Plan',
        memoryContext: '',
        fileContext: ''
      };

      const result = await nano.buildCouncilPromptWithLlm(input, mockLlm);

      expect(result.responseContract).toContain('RESPONSE CONTRACT');
    });
  });
});
