import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn()
    }))
  }
}));

import * as vscode from 'vscode';
import { ConsensusSynthesizer } from './synthesizer';

describe('ConsensusSynthesizer', () => {
  let synthesizer: ConsensusSynthesizer;
  let mockOutput: { appendLine: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOutput = { appendLine: vi.fn() };
    synthesizer = new ConsensusSynthesizer(mockOutput as unknown as vscode.OutputChannel);
  });

  describe('synthesize', () => {
    it('combines council outputs into synthesized response', () => {
      const result = synthesizer.synthesize({
        mode: 'plan',
        rubric: 'Test rubric',
        outputStyle: 'concise',
        responseContract: 'Follow the contract',
        userText: 'Help me plan a feature',
        council: {
          codex: 'Codex suggests: Create a new module',
          claude: 'Claude suggests: Add comprehensive tests',
          gemini: 'Gemini suggests: Consider edge cases'
        }
      });

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty council outputs', () => {
      const result = synthesizer.synthesize({
        mode: 'code',
        rubric: 'Test rubric',
        outputStyle: 'detailed',
        responseContract: '',
        userText: 'Write a function',
        council: {
          codex: '',
          claude: '',
          gemini: ''
        }
      });

      expect(result).toBeTruthy();
    });

    it('handles error messages in council outputs', () => {
      const result = synthesizer.synthesize({
        mode: 'review',
        rubric: 'Test rubric',
        outputStyle: 'brief',
        responseContract: '',
        userText: 'Review my code',
        council: {
          codex: 'ERROR: timeout',
          claude: 'The code looks good with minor issues',
          gemini: '[skipped]'
        }
      });

      expect(result).toBeTruthy();
      expect(result.toLowerCase()).not.toContain('undefined');
    });

    it('produces output matching the mode context', () => {
      const result = synthesizer.synthesize({
        mode: 'refactor',
        rubric: 'Focus on code quality',
        outputStyle: 'actionable',
        responseContract: 'Include specific steps',
        userText: 'Refactor this function',
        council: {
          codex: '1. Extract helper function\n2. Add type annotations',
          claude: '1. Simplify conditionals\n2. Add error handling',
          gemini: '1. Use modern syntax\n2. Add documentation'
        }
      });

      expect(result).toBeTruthy();
      // Synthesis should include some council suggestions
      expect(result.length).toBeGreaterThan(50);
    });

    it('includes raw council notes section', () => {
      const result = synthesizer.synthesize({
        mode: 'ask',
        rubric: '',
        outputStyle: '',
        responseContract: '',
        userText: 'What is TypeScript?',
        council: {
          codex: 'TypeScript is a typed superset of JavaScript',
          claude: 'TypeScript adds static typing to JavaScript',
          gemini: 'TypeScript helps catch errors at compile time'
        }
      });

      // Check that council notes are included
      expect(result).toContain('Codex');
      expect(result).toContain('Claude');
      expect(result).toContain('Gemini');
    });
  });
});
