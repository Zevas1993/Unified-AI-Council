import * as vscode from 'vscode';

/**
 * Embedded LLM engine using Transformers.js with ONNX models.
 * Provides in-process text generation for prompt shaping and synthesis.
 */
export class EmbeddedLlm {
  private generator: unknown = null;
  private loading: Promise<void> | null = null;
  private loadError: Error | null = null;
  private isLoading = false; // Additional flag to prevent race conditions

  constructor(
    private readonly modelId: string,
    private readonly output: vscode.OutputChannel
  ) {}

  /**
   * Check if the model is currently loaded and ready.
   */
  isLoaded(): boolean {
    return this.generator !== null;
  }

  /**
   * Check if loading failed.
   */
  hasError(): boolean {
    return this.loadError !== null;
  }

  /**
   * Get the loading error if any.
   */
  getError(): Error | null {
    return this.loadError;
  }

  /**
   * Ensure the model is loaded. Lazy-loads on first call.
   */
  async ensureLoaded(): Promise<void> {
    if (this.generator) return;
    if (this.loadError) throw this.loadError;
    if (this.loading) return this.loading;

    // Double-check pattern to prevent race condition
    if (this.isLoading) {
      // Another call started loading between our checks, wait for it
      while (this.isLoading && !this.generator && !this.loadError) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.generator) return;
      if (this.loadError) throw this.loadError;
    }

    this.isLoading = true;
    this.loading = this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      this.output.appendLine(`[embedded] Loading model: ${this.modelId}`);

      // Dynamic import of @huggingface/transformers (ESM module)
      const { pipeline } = await import('@huggingface/transformers');

      // Create text generation pipeline with quantized model
      this.generator = await pipeline('text-generation', this.modelId, {
        dtype: 'q4f16', // 4-bit quantization for small size
        device: 'cpu', // Use CPU for compatibility
      });

      this.output.appendLine(`[embedded] Model loaded successfully`);
    } catch (err) {
      this.loadError = err instanceof Error ? err : new Error(String(err));
      this.output.appendLine(`[embedded] Failed to load model: ${this.loadError.message}`);
      throw this.loadError;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Generate text completion for the given prompt.
   */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    await this.ensureLoaded();

    const maxTokens = options.maxTokens ?? 256;
    const temperature = options.temperature ?? 0.3;

    try {
      // Type assertion for the generator pipeline
      const gen = this.generator as (
        prompt: string,
        options: Record<string, unknown>
      ) => Promise<Array<{ generated_text: string }>>;

      const result = await gen(prompt, {
        max_new_tokens: maxTokens,
        temperature,
        do_sample: temperature > 0,
        return_full_text: false, // Only return generated text, not the prompt
      });

      const generated = result[0]?.generated_text ?? '';
      this.output.appendLine(`[embedded] Generated ${generated.length} chars`);
      return generated.trim();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.output.appendLine(`[embedded] Generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Dispose of the model and free resources.
   */
  dispose(): void {
    this.generator = null;
    this.loading = null;
    this.loadError = null;
    this.output.appendLine(`[embedded] Model disposed`);
  }
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}
