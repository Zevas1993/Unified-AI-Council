import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args)
}));

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    createTerminal: vi.fn(() => ({
      show: vi.fn()
    }))
  }
}));

// Mock settings
vi.mock('../settings/settings', () => ({
  Settings: vi.fn().mockImplementation(() => ({
    wslDistro: vi.fn(() => ''),
    wslShell: vi.fn(() => 'bash'),
    codexCommand: vi.fn(() => ({ cmd: 'codex', error: undefined })),
    claudeCommand: vi.fn(() => ({ cmd: 'claude', error: undefined })),
    geminiCommand: vi.fn(() => ({ cmd: 'gemini', error: undefined }))
  }))
}));

import * as vscode from 'vscode';
import { WslCliRunner } from './wslCliRunner';
import { Settings } from '../settings/settings';

class MockChildProcess extends EventEmitter {
  stdin = {
    write: vi.fn(),
    end: vi.fn()
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

describe('WslCliRunner', () => {
  let runner: WslCliRunner;
  let mockOutput: vscode.OutputChannel;
  let mockSettings: Settings;
  let appendedLines: string[];

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;

    mockSettings = new Settings();
    runner = new WslCliRunner(mockOutput, mockSettings);

    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('openInteractiveSetupTerminal', () => {
    it('creates terminal for codex setup', async () => {
      await runner.openInteractiveSetupTerminal('codex');

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unified AI Council Setup: codex',
          shellPath: 'wsl.exe'
        })
      );
      expect(appendedLines.some(l => l.includes('terminal opened for codex'))).toBe(true);
    });

    it('creates terminal for claude setup', async () => {
      await runner.openInteractiveSetupTerminal('claude');

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unified AI Council Setup: claude'
        })
      );
    });

    it('creates terminal for gemini setup', async () => {
      await runner.openInteractiveSetupTerminal('gemini');

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unified AI Council Setup: gemini'
        })
      );
    });

    it('includes distro in args when configured', async () => {
      vi.mocked(mockSettings.wslDistro).mockReturnValue('Ubuntu');

      await runner.openInteractiveSetupTerminal('codex');

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          shellArgs: expect.arrayContaining(['-d', 'Ubuntu'])
        })
      );
    });
  });

  describe('runCouncilMember', () => {
    it('spawns wsl.exe with correct arguments', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'You are a coding assistant',
        instruction: 'Help with the task'
      };

      const promise = runner.runCouncilMember('codex', role, 'test prompt', 5000);

      // Simulate successful output
      mockChild.stdout.emit('data', 'Response from codex');
      mockChild.emit('close', 0);

      const result = await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'wsl.exe',
        expect.arrayContaining(['-e', 'bash', '-lc']),
        expect.objectContaining({ windowsHide: true })
      );
      expect(result).toContain('Response from codex');
    });

    it('handles timeout correctly', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'You are a coding assistant',
        instruction: 'Help with the task'
      };

      const promise = runner.runCouncilMember('codex', role, 'test prompt', 100);

      // Don't emit close - let it timeout
      await expect(promise).rejects.toThrow('codex timed out after 100ms');
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('handles process error', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'You are a coding assistant',
        instruction: 'Help with the task'
      };

      const promise = runner.runCouncilMember('codex', role, 'test prompt', 5000);

      mockChild.emit('error', new Error('Spawn failed'));

      await expect(promise).rejects.toThrow('Spawn failed');
    });

    it('combines stdout and stderr', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'Test',
        instruction: 'Test'
      };

      const promise = runner.runCouncilMember('claude', role, 'prompt', 5000);

      mockChild.stdout.emit('data', 'stdout content');
      mockChild.stderr.emit('data', 'stderr content');
      mockChild.emit('close', 0);

      const result = await promise;

      expect(result).toContain('stdout content');
      expect(result).toContain('[stderr]');
      expect(result).toContain('stderr content');
    });

    it('handles empty output', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'Test',
        instruction: 'Test'
      };

      const promise = runner.runCouncilMember('gemini', role, 'prompt', 5000);

      mockChild.emit('close', 0);

      const result = await promise;

      expect(result).toContain('[gemini] (no output)');
    });

    it('writes payload to stdin', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = {
        systemRole: 'System role text',
        instruction: 'Instruction text'
      };

      const promise = runner.runCouncilMember('codex', role, 'user prompt', 5000);

      mockChild.stdout.emit('data', 'output');
      mockChild.emit('close', 0);

      await promise;

      expect(mockChild.stdin.write).toHaveBeenCalled();
      const writtenPayload = mockChild.stdin.write.mock.calls[0][0];
      expect(writtenPayload).toContain('SYSTEM ROLE:');
      expect(writtenPayload).toContain('System role text');
      expect(writtenPayload).toContain('INSTRUCTIONS:');
      expect(writtenPayload).toContain('Instruction text');
      expect(writtenPayload).toContain('PROMPT:');
      expect(writtenPayload).toContain('user prompt');
      expect(mockChild.stdin.end).toHaveBeenCalled();
    });

    it('prevents race condition between timeout and close', async () => {
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild);

      const role = { systemRole: 'Test', instruction: 'Test' };

      const promise = runner.runCouncilMember('codex', role, 'prompt', 50);

      // Emit close just before timeout would fire
      setTimeout(() => {
        mockChild.stdout.emit('data', 'valid output');
        mockChild.emit('close', 0);
      }, 30);

      const result = await promise;

      // Should resolve with output, not reject with timeout
      expect(result).toContain('valid output');
    });

    it('returns error message when CLI command is invalid (graceful degradation)', async () => {
      vi.mocked(mockSettings.codexCommand).mockReturnValue({
        cmd: '',
        error: 'Invalid command'
      });

      const role = { systemRole: 'Test', instruction: 'Test' };

      const result = await runner.runCouncilMember('codex', role, 'prompt', 5000);

      // Should not throw - instead returns error message for graceful degradation
      expect(result).toContain('[codex] Configuration error');
      expect(result).toContain('Invalid command');
      expect(appendedLines.some(l => l.includes('Invalid CLI command'))).toBe(true);
    });
  });
});
