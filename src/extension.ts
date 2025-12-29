import * as vscode from 'vscode';
import { CouncilOrchestrator, CouncilMode } from './orchestrator/orchestrator';
import { ProjectMemory } from './memory/projectMemory';
import * as fs from 'node:fs';
import { randomBytes } from 'node:crypto';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Unified AI Council');
  const memory = new ProjectMemory(output);

  const orchestrator = new CouncilOrchestrator(output, memory);

  const provider = new CouncilSidebarProvider(context.extensionUri, orchestrator, memory, output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CouncilSidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.open', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.unifiedAiCouncil');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.setup', async () => {
      await orchestrator.runSetupWizard();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unifiedAiCouncil.resetMemory', async () => {
      const ok = await vscode.window.showWarningMessage(
        'Reset Unified AI Council project memory for this workspace?',
        { modal: true },
        'Reset'
      );
      if (ok === 'Reset') {
        await memory.resetForWorkspace();
        vscode.window.showInformationMessage('Project memory reset.');
      }
    })
  );

  output.appendLine('[activate] Unified AI Council activated.');
}

export function deactivate() {}

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
          const mode = (msg.mode as CouncilMode) ?? 'plan';
          const text = String(msg.text ?? '').trim();
          const options = (msg.options ?? {}) as any;
          if (!text) return;

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

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'index.html');
    const html = fs.readFileSync(htmlPath.fsPath, 'utf8') as string;
    const nonce = getNonce();
    return html.replaceAll('__NONCE__', nonce);
  }
}

function getNonce(): string {
  // CSP nonces should be unpredictable; use crypto.
  return randomBytes(16).toString('base64');
}
