import * as vscode from 'vscode';

export interface OllamaConfig {
  /** Base URL, e.g. http://127.0.0.1:11434 */
  baseUrl: string;
  /** Model name, e.g. llama3.2:3b */
  model: string;
  /** Optional temperature */
  temperature?: number;
  /** Optional top_p */
  top_p?: number;
  /** Optional max tokens (Ollama: num_predict) */
  maxTokens?: number;
}

export interface SynthesisInput {
  mode: string;
  prompt: string;
  responseContract: string;
  councilNotes: string;
}

type OllamaGenerateResponse = {
  response?: string;
  done?: boolean;
  error?: string;
};

function normalizeBaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  return u.length ? u : 'http://127.0.0.1:11434';
}

/**
 * Simple Ollama-backed synthesizer.
 *
 * This is used when the user selects orchestratorEngine = 'ollama'.
 * It does ONE non-streaming /api/generate call.
 */
export class LocalModelSynthesizer {
  constructor(private output: vscode.OutputChannel) {}

  async synthesizeWithOllama(config: OllamaConfig, input: SynthesisInput): Promise<string> {
    const baseUrl = normalizeBaseUrl(config.baseUrl);
    const url = `${baseUrl}/api/generate`;

    const fullPrompt = [
      `You are the Orchestrator of a 3-member AI coding council.`,
      `Your job: synthesize the best single response, grounded in the council notes, and obey the response contract.`,
      ``,
      `MODE: ${input.mode}`,
      ``,
      `RESPONSE CONTRACT (must follow):`,
      input.responseContract.trim(),
      ``,
      `USER PROMPT:`,
      input.prompt.trim(),
      ``,
      `COUNCIL NOTES (raw):`,
      input.councilNotes.trim(),
      ``,
      `Now produce the final response.`
    ].join('\n');

    const body = {
      model: config.model,
      prompt: fullPrompt,
      stream: false,
      options: {
        ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
        ...(typeof config.top_p === 'number' ? { top_p: config.top_p } : {}),
        ...(typeof config.maxTokens === 'number' ? { num_predict: config.maxTokens } : {}),
      },
    };

    this.output.appendLine(`[UAC] Ollama synth request -> ${url} (model=${config.model})`);

    // VS Code extension host is Node >= 18/20, so global fetch exists.
    // If not, this will throw, and orchestrator will fall back.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch((e) => {
        this.output.appendLine(`[UAC] Failed to read error response body: ${e instanceof Error ? e.message : String(e)}`);
        return '';
      });
      throw new Error(`Ollama /api/generate failed: HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
    }

    const json = (await res.json()) as OllamaGenerateResponse;
    if (json.error) throw new Error(`Ollama error: ${json.error}`);
    const out = (json.response ?? '').trim();
    if (!out) throw new Error('Ollama returned an empty response.');
    return out;
  }
}
