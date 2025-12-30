import * as vscode from 'vscode';
import { CouncilOrchestrator } from './orchestrator/orchestrator';
import { CouncilMode, VALID_MODES } from './orchestrator/modes';
import { ProjectMemory } from './memory/projectMemory';
import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';

// Store orchestrator reference for cleanup on deactivate
let orchestratorInstance: CouncilOrchestrator | null = null;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Unified AI Council');
  const memory = new ProjectMemory(output);

  const orchestrator = new CouncilOrchestrator(output, memory);
  orchestratorInstance = orchestrator;

  const provider = new CouncilSidebarProvider(context.extensionUri, orchestrator, memory, output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CouncilSidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.open', async () => {
      try {
        await vscode.commands.executeCommand('workbench.view.extension.unifiedAiCouncil');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[error] Failed to open council view: ${msg}`);
        vscode.window.showErrorMessage(`Failed to open Unified AI Council: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.setup', async () => {
      try {
        await orchestrator.runSetupWizard();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[error] Setup wizard failed: ${msg}`);
        vscode.window.showErrorMessage(`Setup wizard failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.resetMemory', async () => {
      try {
        const ok = await vscode.window.showWarningMessage(
          'Reset Unified AI Council project memory for this workspace?',
          { modal: true },
          'Reset'
        );
        if (ok === 'Reset') {
          await memory.resetForWorkspace();
          vscode.window.showInformationMessage('Project memory reset.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[error] Failed to reset memory: ${msg}`);
        vscode.window.showErrorMessage(`Failed to reset memory: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.validateConfig', async () => {
      try {
        await runConfigValidation(orchestrator, output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[error] Validation failed: ${msg}`);
        vscode.window.showErrorMessage(`Validation failed: ${msg}`);
      }
    })
  );

  // Register disposable to clean up orchestrator resources
  context.subscriptions.push({
    dispose: () => {
      if (orchestratorInstance) {
        orchestratorInstance.dispose();
        orchestratorInstance = null;
      }
    }
  });

  output.appendLine('[activate] Unified AI Council activated.');
}

/**
 * Run configuration validation and report results to user.
 */
async function runConfigValidation(
  orchestrator: CouncilOrchestrator,
  output: vscode.OutputChannel
): Promise<void> {
  const results: Array<{ name: string; status: 'ok' | 'warn' | 'error'; message: string }> = [];
  const settings = orchestrator.getSettings();

  output.appendLine('[validate] Starting configuration validation...');

  // Check WSL availability
  try {
    const { execSync } = await import('child_process');
    execSync('wsl.exe --status', { timeout: 5000, windowsHide: true });
    results.push({ name: 'WSL', status: 'ok', message: 'WSL is available' });
  } catch {
    results.push({ name: 'WSL', status: 'error', message: 'WSL not available or not responding' });
  }

  // Check CLI commands configuration
  const codexCmd = settings.codexCommand();
  const claudeCmd = settings.claudeCommand();
  const geminiCmd = settings.geminiCommand();

  results.push({
    name: 'Codex CLI',
    status: codexCmd.error ? 'error' : 'ok',
    message: codexCmd.error ?? `Command: ${codexCmd.cmd}`
  });

  results.push({
    name: 'Claude CLI',
    status: claudeCmd.error ? 'error' : 'ok',
    message: claudeCmd.error ?? `Command: ${claudeCmd.cmd}`
  });

  results.push({
    name: 'Gemini CLI',
    status: geminiCmd.error ? 'error' : 'ok',
    message: geminiCmd.error ?? `Command: ${geminiCmd.cmd}`
  });

  // Check orchestrator engine
  const engine = settings.orchestratorEngine();
  results.push({
    name: 'Orchestrator Engine',
    status: 'ok',
    message: `Using: ${engine}`
  });

  // Check Ollama connectivity if configured
  if (engine === 'ollama') {
    const ollamaConfig = settings.ollamaConfig();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${ollamaConfig.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        results.push({
          name: 'Ollama Server',
          status: 'ok',
          message: `Connected to ${ollamaConfig.baseUrl}`
        });
      } else {
        results.push({
          name: 'Ollama Server',
          status: 'error',
          message: `HTTP ${res.status} from ${ollamaConfig.baseUrl}`
        });
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Connection timeout'
        : err instanceof Error ? err.message : String(err);
      results.push({
        name: 'Ollama Server',
        status: 'error',
        message: `Cannot connect to ${ollamaConfig.baseUrl}: ${msg}`
      });
    }
  }

  // Check embedded LLM if configured
  if (engine === 'embedded' && settings.embeddedEnabled()) {
    results.push({
      name: 'Embedded LLM',
      status: 'ok',
      message: `Model: ${settings.embeddedModelId()}`
    });
  }

  // Check workspace
  const ws = vscode.workspace.workspaceFolders?.[0];
  results.push({
    name: 'Workspace',
    status: ws ? 'ok' : 'warn',
    message: ws ? `Folder: ${ws.name}` : 'No workspace folder open'
  });

  // Log all results
  output.appendLine('[validate] Results:');
  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'warn' ? '⚠' : '✗';
    output.appendLine(`  ${icon} ${r.name}: ${r.message}`);
  }

  // Show summary to user
  const errors = results.filter(r => r.status === 'error');
  const warnings = results.filter(r => r.status === 'warn');

  if (errors.length > 0) {
    const errorNames = errors.map(e => e.name).join(', ');
    Promise.resolve(vscode.window.showErrorMessage(
      `Configuration issues found: ${errorNames}. Check Output panel for details.`,
      'Show Output'
    )).then(selection => {
      if (selection === 'Show Output') {
        output.show();
      }
    }).catch((err: unknown) => {
      output.appendLine(`[validate] Failed to show error message: ${err instanceof Error ? err.message : String(err)}`);
    });
  } else if (warnings.length > 0) {
    Promise.resolve(vscode.window.showWarningMessage(
      `Configuration validated with ${warnings.length} warning(s). Check Output panel for details.`,
      'Show Output'
    )).then(selection => {
      if (selection === 'Show Output') {
        output.show();
      }
    }).catch((err: unknown) => {
      output.appendLine(`[validate] Failed to show warning message: ${err instanceof Error ? err.message : String(err)}`);
    });
  } else {
    Promise.resolve(vscode.window.showInformationMessage(
      `✓ All ${results.length} configuration checks passed!`
    )).catch((err: unknown) => {
      output.appendLine(`[validate] Failed to show info message: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  output.appendLine('[validate] Validation complete.');
}

export function deactivate() {
  // Clean up embedded LLM resources
  if (orchestratorInstance) {
    orchestratorInstance.dispose();
    orchestratorInstance = null;
  }
}

class CouncilSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'unifiedAiCouncil.sidebar';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly orchestrator: CouncilOrchestrator,
    private readonly memory: ProjectMemory,
    private readonly output: vscode.OutputChannel
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    const wsName = vscode.workspace.name ?? '';
    webviewView.webview.postMessage({ type: 'workspaceInfo', workspaceName: wsName });

    // Send engine info
    const settings = this.orchestrator.getSettings();
    const engine = settings.orchestratorEngine();
    const modelId = engine === 'embedded' ? settings.embeddedModelId() :
                    engine === 'ollama' ? settings.ollamaConfig().model : 'heuristic';
    // Extract short model name (e.g., "Qwen2.5-Coder" from "onnx-community/Qwen2.5-Coder-0.5B-Instruct")
    const shortModel = modelId.split('/').pop()?.replace(/-Instruct$/, '').replace(/-0\.5B$/, '') ?? modelId;
    webviewView.webview.postMessage({ type: 'engineInfo', engine, model: shortModel });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        if (msg.type === 'ready') return;

        if (msg.type === 'setup') {
          await this.orchestrator.runSetupWizard();
          webviewView.webview.postMessage({ type: 'status', text: 'Setup terminal opened.' });
          return;
        }

        if (msg.type === 'resetMemory') {
          await this.memory.resetForWorkspace();
          webviewView.webview.postMessage({ type: 'status', text: 'Project memory reset.' });
          return;
        }

        if (msg.type === 'userMessage') {
          const mode = isValidCouncilMode(msg.mode) ? msg.mode : 'plan';
          const text = String(msg.text ?? '').trim();
          const options = parseCouncilOptions(msg.options);
          if (!text) return;

          // Prevent excessively large messages (100KB limit)
          const MAX_TEXT_LENGTH = 100000;
          if (text.length > MAX_TEXT_LENGTH) {
            webviewView.webview.postMessage({
              type: 'status',
              text: `Error: Message too long (${Math.round(text.length / 1000)}KB). Max is ${MAX_TEXT_LENGTH / 1000}KB.`
            });
            return;
          }

          webviewView.webview.postMessage({ type: 'status', text: 'Running council…' });
          const result = await this.orchestrator.runCouncil(text, mode, options);
          webviewView.webview.postMessage({ type: 'councilResult', text: result });
          return;
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.output.appendLine(`[error] ${e.message}`);
        webviewView.webview.postMessage({ type: 'status', text: `Error: ${e.message}` });
      }
    });
  }

  private getHtml(_webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'index.html');
    try {
      const html = fs.readFileSync(htmlPath.fsPath, 'utf8');
      const nonce = getNonce();
      return html.replaceAll('__NONCE__', nonce);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[error] Failed to load webview HTML: ${msg}`);
      return `<!DOCTYPE html><html><body><h1>Error</h1><p>Failed to load Unified AI Council webview: ${msg}</p></body></html>`;
    }
  }
}

function getNonce(): string {
  // CSP nonces should be unpredictable; use crypto.
  return randomBytes(16).toString('base64');
}

/** Type guard for CouncilMode */
function isValidCouncilMode(value: unknown): value is CouncilMode {
  return typeof value === 'string' && VALID_MODES.includes(value as CouncilMode);
}

/** Parse and validate council run options from webview message */
function parseCouncilOptions(options: unknown): { architect?: boolean; memory?: boolean; consensus?: boolean; fast?: boolean } {
  if (!options || typeof options !== 'object') {
    return {};
  }
  const opts = options as Record<string, unknown>;
  return {
    architect: typeof opts.architect === 'boolean' ? opts.architect : undefined,
    memory: typeof opts.memory === 'boolean' ? opts.memory : undefined,
    consensus: typeof opts.consensus === 'boolean' ? opts.consensus : undefined,
    fast: typeof opts.fast === 'boolean' ? opts.fast : undefined,
  };
}
