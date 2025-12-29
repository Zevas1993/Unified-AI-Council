import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type MemoryEntry = {
  id: string;
  ts: number;
  kind: 'council';
  mode: string;
  userText: string;
  final: string;
  council: { codex: string; claude: string; gemini: string; };
};

export class ProjectMemory {
  constructor(private readonly output: vscode.OutputChannel) {}

  private getWorkspaceRoot(): string | null {
    const ws = vscode.workspace.workspaceFolders?.[0];
    return ws ? ws.uri.fsPath : null;
  }

  private getStoreDir(): string | null {
    const root = this.getWorkspaceRoot();
    if (!root) return null;
    const dir = path.join(root, '.unified-ai-council');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getEntriesPath(): string | null {
    const dir = this.getStoreDir();
    return dir ? path.join(dir, 'memory.jsonl') : null;
  }

  public async resetForWorkspace(): Promise<void> {
    const p = this.getEntriesPath();
    if (!p) return;
    if (fs.existsSync(p)) fs.unlinkSync(p);
    this.output.appendLine('[memory] reset');
  }

  public async addEntry(entry: Omit<MemoryEntry, 'id'|'ts'> & Partial<Pick<MemoryEntry,'id'|'ts'>>): Promise<void> {
    const p = this.getEntriesPath();
    if (!p) return;

    const full: MemoryEntry = {
      id: entry.id ?? randomId(),
      ts: entry.ts ?? Date.now(),
      kind: 'council',
      mode: entry.mode,
      userText: entry.userText,
      final: entry.final,
      council: entry.council
    };

    fs.appendFileSync(p, JSON.stringify(full) + '\n', 'utf8');
  }

  public async buildContextForPrompt(userText: string): Promise<string> {
    const p = this.getEntriesPath();
    if (!p || !fs.existsSync(p)) return '(no saved project memory yet)';

    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
    const entries = lines.slice(-30).map(safeParse).filter(Boolean) as MemoryEntry[];

    const keywords = extractKeywords(userText);
    const scored = entries.map(e => ({
      e,
      score: overlapScore(keywords, extractKeywords(e.userText + ' ' + e.final))
    })).sort((a,b) => b.score - a.score);

    const top = scored.slice(0, 6).map(s => s.e);

    return top.map(e => {
      const q = trimTo(e.userText, 350);
      const a = trimTo(e.final, 600);
      return `- [${new Date(e.ts).toLocaleString()}] (${e.mode}) Q: ${q}\n  A: ${a}`;
    }).join('\n') || '(memory exists but nothing relevant found)';
  }

  public async captureWorkspaceSnapshotHints(wsUri: vscode.Uri): Promise<string> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(wsUri);
      return entries.slice(0, 40)
        .map(([name, type]) => `${type === vscode.FileType.Directory ? 'dir ' : 'file'}: ${name}`)
        .join('\n') || '(workspace empty)';
    } catch {
      return '(unable to read workspace)';
    }
  }
}

function safeParse(line: string): MemoryEntry | null {
  try { return JSON.parse(line) as MemoryEntry; } catch { return null; }
}

function randomId(): string {
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2,'0')).join('');
}

function extractKeywords(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z0-9_\-]{3,}/g) ?? [];
  const stop = new Set(['the','and','for','with','that','this','from','into','your','you','are','was','were','will','have','has','had','about']);
  const out = new Set<string>();
  for (const w of words) if (!stop.has(w)) out.add(w);
  return out;
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  for (const w of a) if (b.has(w)) score++;
  return score;
}

function trimTo(s: string, max: number): string {
  return s.length <= max ? s : (s.slice(0, max - 1).trimEnd() + '…');
}
