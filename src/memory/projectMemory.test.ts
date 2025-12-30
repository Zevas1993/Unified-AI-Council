import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
    fs: {
      readDirectory: vi.fn()
    }
  },
  FileType: {
    Directory: 2,
    File: 1
  }
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn()
}));

// Mock crypto
vi.stubGlobal('crypto', {
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i;
    return arr;
  }
});

import * as vscode from 'vscode';
import { ProjectMemory, MemoryEntry } from './projectMemory';

describe('ProjectMemory', () => {
  let memory: ProjectMemory;
  let mockOutput: vscode.OutputChannel;
  let appendedLines: string[];

  beforeEach(() => {
    appendedLines = [];
    mockOutput = {
      appendLine: vi.fn((line: string) => appendedLines.push(line))
    } as unknown as vscode.OutputChannel;
    memory = new ProjectMemory(mockOutput);

    // Reset all mocks
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();
    vi.mocked(fs.appendFileSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('resetForWorkspace', () => {
    it('does nothing when no workspace folder', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = undefined;
      await memory.resetForWorkspace();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('creates directory if it does not exist', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await memory.resetForWorkspace();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join('/mock/workspace', '.unified-ai-council'),
        { recursive: true }
      );
    });

    it('deletes memory file if it exists', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await memory.resetForWorkspace();

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join('/mock/workspace', '.unified-ai-council', 'memory.jsonl')
      );
      expect(appendedLines).toContain('[memory] reset');
    });

    it('handles unlinkSync errors gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await memory.resetForWorkspace();

      expect(appendedLines.some(l => l.includes('Failed to reset memory file'))).toBe(true);
    });

    it('handles mkdirSync errors gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      await memory.resetForWorkspace();

      expect(appendedLines.some(l => l.includes('Failed to create storage directory'))).toBe(true);
    });
  });

  describe('addEntry', () => {
    it('appends entry as JSONL', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const entry = {
        kind: 'council' as const,
        mode: 'plan',
        userText: 'test question',
        final: 'test answer',
        council: { codex: 'a', claude: 'b', gemini: 'c' }
      };

      await memory.addEntry(entry);

      expect(fs.appendFileSync).toHaveBeenCalled();
      const [filePath, content] = vi.mocked(fs.appendFileSync).mock.calls[0];
      expect(filePath).toContain('memory.jsonl');
      expect(content).toContain('"mode":"plan"');
      expect(content).toContain('"userText":"test question"');
    });

    it('handles appendFileSync errors gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.appendFileSync).mockImplementation(() => {
        throw new Error('Write failed');
      });

      const entry = {
        kind: 'council' as const,
        mode: 'plan',
        userText: 'test',
        final: 'test',
        council: { codex: '', claude: '', gemini: '' }
      };

      await memory.addEntry(entry);

      expect(appendedLines.some(l => l.includes('Failed to write entry'))).toBe(true);
    });
  });

  describe('buildContextForPrompt', () => {
    it('returns message when no memory file exists', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await memory.buildContextForPrompt('test');

      expect(result).toBe('(no saved project memory yet)');
    });

    it('returns message when file is too large', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 20 * 1024 * 1024 } as fs.Stats); // 20MB

      const result = await memory.buildContextForPrompt('test');

      expect(result).toBe('(memory file too large)');
      expect(appendedLines.some(l => l.includes('too large'))).toBe(true);
    });

    it('parses JSONL and returns relevant entries', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1000 } as fs.Stats);

      const entry: MemoryEntry = {
        id: 'test-id',
        ts: Date.now(),
        kind: 'council',
        mode: 'plan',
        userText: 'how to implement authentication',
        final: 'Use JWT tokens for stateless auth',
        council: { codex: 'a', claude: 'b', gemini: 'c' }
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry) + '\n');

      const result = await memory.buildContextForPrompt('authentication');

      expect(result).toContain('authentication');
      expect(result).toContain('JWT');
    });

    it('handles malformed JSON lines gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json\n{"also":"invalid\n');

      const result = await memory.buildContextForPrompt('test');

      // Should not throw, returns fallback message
      expect(result).toBe('(memory exists but nothing relevant found)');
    });

    it('handles readFileSync errors gracefully', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = await memory.buildContextForPrompt('test');

      expect(result).toBe('(unable to read project memory)');
      expect(appendedLines.some(l => l.includes('Failed to read memory file'))).toBe(true);
    });

    it('scores entries by keyword overlap', async () => {
      vi.mocked(vscode.workspace).workspaceFolders = [{ uri: { fsPath: '/mock/workspace' } }] as any;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1000 } as fs.Stats);

      const entries: MemoryEntry[] = [
        {
          id: '1',
          ts: Date.now(),
          kind: 'council',
          mode: 'plan',
          userText: 'database schema design',
          final: 'Use normalized tables',
          council: { codex: '', claude: '', gemini: '' }
        },
        {
          id: '2',
          ts: Date.now(),
          kind: 'council',
          mode: 'plan',
          userText: 'authentication security',
          final: 'Use JWT and OAuth',
          council: { codex: '', claude: '', gemini: '' }
        }
      ];

      vi.mocked(fs.readFileSync).mockReturnValue(
        entries.map(e => JSON.stringify(e)).join('\n')
      );

      const result = await memory.buildContextForPrompt('authentication OAuth tokens');

      // The authentication entry should be ranked higher
      const lines = result.split('\n');
      expect(lines[0]).toContain('authentication');
    });
  });

  describe('captureWorkspaceSnapshotHints', () => {
    it('returns formatted directory listing', async () => {
      vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([
        ['src', vscode.FileType.Directory],
        ['package.json', vscode.FileType.File],
      ] as any);

      const wsUri = { fsPath: '/mock/workspace' } as vscode.Uri;
      const result = await memory.captureWorkspaceSnapshotHints(wsUri);

      expect(result).toContain('dir : src');
      expect(result).toContain('file: package.json');
    });

    it('returns message on empty workspace', async () => {
      vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValue([]);

      const wsUri = { fsPath: '/mock/workspace' } as vscode.Uri;
      const result = await memory.captureWorkspaceSnapshotHints(wsUri);

      expect(result).toBe('(workspace empty)');
    });

    it('handles errors gracefully', async () => {
      vi.mocked(vscode.workspace.fs.readDirectory).mockRejectedValue(new Error('Access denied'));

      const wsUri = { fsPath: '/mock/workspace' } as vscode.Uri;
      const result = await memory.captureWorkspaceSnapshotHints(wsUri);

      expect(result).toBe('(unable to read workspace)');
      expect(appendedLines.some(l => l.includes('Failed to read workspace directory'))).toBe(true);
    });
  });
});
