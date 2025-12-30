import * as vscode from 'vscode';

/**
 * Log levels for categorizing messages.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Valid component prefixes for structured logging.
 */
export type LogComponent =
  | 'activate'
  | 'cli'
  | 'council'
  | 'embedded'
  | 'memory'
  | 'nano'
  | 'ollama'
  | 'settings'
  | 'synth'
  | 'webview';

/**
 * Structured logger for consistent output formatting.
 *
 * Usage:
 * ```ts
 * const logger = new Logger(outputChannel);
 * logger.info('memory', 'Entry added');
 * logger.error('cli', 'Command failed', error);
 * ```
 */
export class Logger {
  constructor(private readonly output: vscode.OutputChannel) {}

  /**
   * Log an informational message.
   */
  info(component: LogComponent, message: string): void {
    this.log('info', component, message);
  }

  /**
   * Log a warning message.
   */
  warn(component: LogComponent, message: string): void {
    this.log('warn', component, message);
  }

  /**
   * Log an error message with optional error object.
   */
  error(component: LogComponent, message: string, err?: unknown): void {
    const errorMsg = err instanceof Error ? `: ${err.message}` : err ? `: ${String(err)}` : '';
    this.log('error', component, `${message}${errorMsg}`);
  }

  /**
   * Log a debug message (only in development).
   */
  debug(component: LogComponent, message: string): void {
    // Could be gated by a debug setting in production
    this.log('debug', component, message);
  }

  /**
   * Core logging method with consistent formatting.
   */
  private log(_level: LogLevel, component: LogComponent, message: string): void {
    // Simple format for output channel - level prefix kept minimal for cleaner logs
    this.output.appendLine(`[${component}] ${message}`);
  }

  /**
   * Get the underlying output channel for direct access.
   */
  getOutputChannel(): vscode.OutputChannel {
    return this.output;
  }
}

/**
 * Create a scoped logger that always logs to a specific component.
 */
export function createScopedLogger(output: vscode.OutputChannel, component: LogComponent): ScopedLogger {
  return new ScopedLogger(new Logger(output), component);
}

/**
 * A logger scoped to a specific component for convenience.
 */
export class ScopedLogger {
  constructor(
    private readonly logger: Logger,
    private readonly component: LogComponent
  ) {}

  info(message: string): void {
    this.logger.info(this.component, message);
  }

  warn(message: string): void {
    this.logger.warn(this.component, message);
  }

  error(message: string, err?: unknown): void {
    this.logger.error(this.component, message, err);
  }

  debug(message: string): void {
    this.logger.debug(this.component, message);
  }
}
