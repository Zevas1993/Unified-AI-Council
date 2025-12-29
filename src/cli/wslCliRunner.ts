import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { Settings } from '../settings/settings';
import { CliRole } from '../orchestrator/modes';

export type CouncilMember = 'codex' | 'claude' | 'gemini';

export class WslCliRunner {
  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly settings: Settings
  ) {}

  public async openInteractiveSetupTerminal(member: CouncilMember): Promise<void> {
    const cmd = this.getCliCommand(member);
    const distro = this.settings.wslDistro();
    const shell = this.settings.wslShell();

    const term = vscode.window.createTerminal({
      name: `Unified AI Council Setup: ${member}`,
      shellPath: 'wsl.exe',
      shellArgs: distro
        ? ['-d', distro, '-e', shell, '-lc', `${cmd} || true`]
        : ['-e', shell, '-lc', `${cmd} || true`]
    });

    term.show(true);
    this.output.appendLine(`[setup] terminal opened for ${member}: ${cmd}`);
  }

  public async runCouncilMember(
    member: CouncilMember,
    role: CliRole,
    councilPrompt: string,
    timeoutMs: number
  ): Promise<string> {
    const cmd = this.getCliCommand(member);
    const distro = this.settings.wslDistro();
    const shell = this.settings.wslShell();

    const argsBase = distro ? ['-d', distro, '-e', shell, '-lc'] : ['-e', shell, '-lc'];

    const payload = buildPayload(role, councilPrompt);
    const script = makeRunnerScript(cmd);

    return await runWsl(payload, ['wsl.exe', ...argsBase, script], timeoutMs, this.output, member);
  }

  private getCliCommand(member: CouncilMember): string {
    const res = member === 'codex'
      ? this.settings.codexCommand()
      : member === 'claude'
        ? this.settings.claudeCommand()
        : this.settings.geminiCommand();

    if (res.error) {
      throw new Error(`[${member}] Invalid CLI command in settings: ${res.error}`);
    }

    return res.cmd;
  }
}

function buildPayload(role: CliRole, prompt: string): string {
  return `SYSTEM ROLE:\n${role.systemRole}\n\nINSTRUCTIONS:\n${role.instruction}\n\nPROMPT:\n${prompt}\n`;
}

function makeRunnerScript(cliCmd: string): string {
  // After validation we should not have unsafe shell metacharacters.
  // Still escape single quotes defensively.
  const safeCli = cliCmd.replace(/'/g, "'\\''");
  const key = inferKey(cliCmd);
  return `
set -e
TMPDIR=\$(mktemp -d)
PAYLOAD_FILE=\"\$TMPDIR/prompt.txt\"
cat > \"\$PAYLOAD_FILE\"

OUT=\"\$TMPDIR/out.txt\"
set +e
cat \"\$PAYLOAD_FILE\" | ${safeCli} > \"\$OUT\" 2>&1
CODE=\$?
set -e

if [ \$CODE -ne 0 ]; then
  set +e
  ${safeCli} \"\$(cat \"\$PAYLOAD_FILE\")\" > \"\$OUT\" 2>&1
  CODE2=\$?
  set -e
  if [ \$CODE2 -ne 0 ]; then
    echo \"[Unified AI Council] CLI invocation failed (stdin + arg fallback). Exit: \$CODE / \$CODE2\" >> \"\$OUT\"
    echo \"[Unified AI Council] Tip: set unifiedAiCouncil.cli.${key}.command to include proper flags for your CLI.\" >> \"\$OUT\"
  fi
fi

cat \"\$OUT\"
`;
}

function inferKey(cliCmd: string): string {
  const lower = cliCmd.toLowerCase();
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('claude')) return 'claude';
  return 'gemini';
}

async function runWsl(
  stdinPayload: string,
  argv: string[],
  timeoutMs: number,
  output: vscode.OutputChannel,
  member: string
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const exe = argv[0];
    const args = argv.slice(1);

    const child = spawn(exe, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`${member} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const out = (stdout + (stderr ? `\n[stderr]\n${stderr}` : '')).trim();
      resolve(out || `[${member}] (no output) exit=${code ?? 'unknown'}`);
    });

    child.stdin.write(stdinPayload);
    child.stdin.end();
  });
}
