import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode
vi.mock('vscode', () => ({}));

import { Logger, ScopedLogger, createScopedLogger } from './logger';
import type * as vscode from 'vscode';

describe('Logger', () => {
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];
  let logger: Logger;

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;
    logger = new Logger(mockOutput);
  });

  describe('info', () => {
    it('logs with component prefix', () => {
      logger.info('memory', 'Entry added');

      expect(appendedLines[0]).toBe('[memory] Entry added');
    });
  });

  describe('warn', () => {
    it('logs warning messages', () => {
      logger.warn('cli', 'Command slow');

      expect(appendedLines[0]).toBe('[cli] Command slow');
    });
  });

  describe('error', () => {
    it('logs error messages', () => {
      logger.error('council', 'Failed to run');

      expect(appendedLines[0]).toBe('[council] Failed to run');
    });

    it('includes Error object message', () => {
      logger.error('council', 'Failed', new Error('Network error'));

      expect(appendedLines[0]).toBe('[council] Failed: Network error');
    });

    it('stringifies non-Error objects', () => {
      logger.error('council', 'Failed', { code: 500 });

      expect(appendedLines[0]).toBe('[council] Failed: [object Object]');
    });

    it('handles string errors', () => {
      logger.error('council', 'Failed', 'timeout');

      expect(appendedLines[0]).toBe('[council] Failed: timeout');
    });
  });

  describe('debug', () => {
    it('logs debug messages', () => {
      logger.debug('embedded', 'Loading model');

      expect(appendedLines[0]).toBe('[embedded] Loading model');
    });
  });

  describe('getOutputChannel', () => {
    it('returns the underlying output channel', () => {
      expect(logger.getOutputChannel()).toBe(mockOutput);
    });
  });
});

describe('ScopedLogger', () => {
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];
  let scopedLogger: ScopedLogger;

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;
    scopedLogger = createScopedLogger(mockOutput, 'synth');
  });

  it('always uses the scoped component', () => {
    scopedLogger.info('Processing');
    scopedLogger.warn('Slow operation');
    scopedLogger.error('Failed', new Error('test'));

    expect(appendedLines[0]).toBe('[synth] Processing');
    expect(appendedLines[1]).toBe('[synth] Slow operation');
    expect(appendedLines[2]).toBe('[synth] Failed: test');
  });

  it('debug works with scoped component', () => {
    scopedLogger.debug('Verbose message');

    expect(appendedLines[0]).toBe('[synth] Verbose message');
  });
});
