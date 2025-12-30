# Unified AI Council

[![VS Code](https://img.shields.io/badge/VS%20Code-1.92+-blue.svg)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

A VS Code extension that orchestrates three AI coding assistants—**Codex CLI**, **Claude Code**, and **Gemini CLI**—as a unified council, synthesizing their responses into a single consensus answer.

## Overview

Instead of switching between multiple AI tools, Unified AI Council runs all three in parallel and intelligently merges their outputs. Each AI brings different strengths:

| Member | Strength | Role in Council |
|--------|----------|-----------------|
| **Codex** | Code generation, completions | Implementation specialist |
| **Claude Code** | Reasoning, architecture | Strategic advisor |
| **Gemini** | Broad knowledge, research | Knowledge synthesizer |

The council operates through WSL, keeping all CLI interactions contained within VS Code.

## Features

- **Single Chat Interface** — One sidebar panel to interact with all three AIs
- **Council Modes** — Specialized prompting for different tasks:
  - `plan` — Architecture and design decisions
  - `code` — Implementation and code generation
  - `review` — Code review and quality checks
  - `ask` — General questions and explanations
  - `refactor` — Code improvement suggestions
- **Consensus Synthesis** — Merges council outputs using configurable strategies
- **Project Memory** — Per-workspace context stored in `.unified-ai-council/`
- **Local-First** — Optional Ollama integration for fully offline synthesis
- **Security-First** — Allowlist-based command validation, CSP-protected webview

## Requirements

- **VS Code** 1.92 or later
- **Node.js** 18+ (20+ recommended)
- **WSL** with Ubuntu or similar distro
- **AI CLIs** installed inside WSL:
  - [Codex CLI](https://github.com/openai/codex)
  - [Claude Code](https://github.com/anthropics/claude-code)
  - [Gemini CLI](https://github.com/google/gemini-cli)

## Installation

### From Source

```bash
git clone https://github.com/Zevas1993/Unified-AI-Council.git
cd Unified-AI-Council
npm install
npm run compile
```

### From VSIX

```bash
npm run package
code --install-extension unified-ai-council-0.1.0.vsix
```

## Getting Started

### 1. Install the CLIs in WSL

```bash
# Inside WSL
npm install -g @openai/codex-cli
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli
```

### 2. Authenticate Each CLI

Open the Command Palette (`Ctrl+Shift+P`) and run:

```
Unified AI Council: Setup OAuth (WSL)
```

Select each CLI to open an interactive terminal for OAuth authentication.

### 3. Start Using the Council

1. Click the **Unified AI Council** icon in the Activity Bar
2. Select a mode (Plan, Code, Review, Ask, Refactor)
3. Type your request and press Enter
4. The council will deliberate and return a synthesized response

## Configuration

Access settings via `File > Preferences > Settings` and search for "Unified AI Council".

### WSL Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `wsl.distro` | `""` | WSL distro name (blank = default) |
| `wsl.shell` | `bash` | Shell to use in WSL |

### CLI Commands

| Setting | Default | Description |
|---------|---------|-------------|
| `cli.codex.command` | `codex` | Codex CLI command |
| `cli.claude.command` | `claude` | Claude Code command |
| `cli.gemini.command` | `gemini` | Gemini CLI command |
| `cli.timeoutMs` | `180000` | Per-CLI timeout (ms) |

### Orchestrator Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `orchestrator.engine` | `nano` | Synthesis engine (`nano` or `ollama`) |
| `orchestrator.maxContextChars` | `14000` | Max context per CLI |

### Ollama Settings (when engine = `ollama`)

| Setting | Default | Description |
|---------|---------|-------------|
| `ollama.baseUrl` | `http://localhost:11434` | Ollama API endpoint |
| `ollama.model` | `llama3.2:3b` | Model for synthesis |
| `ollama.temperature` | `0.2` | Sampling temperature |
| `ollama.topP` | `0.95` | Top-p nucleus sampling |
| `ollama.maxTokens` | `900` | Max tokens for response |

## Architecture

```
src/
├── extension.ts              # Extension entry point, webview provider
├── cli/
│   └── wslCliRunner.ts       # WSL process spawning, CLI execution
├── orchestrator/
│   ├── orchestrator.ts       # Council coordination
│   ├── modes.ts              # Mode profiles and role definitions
│   ├── nanoOrchestrator.ts   # Lightweight prompt builder
│   ├── synthesizer.ts        # Heuristic consensus merger
│   └── localModelSynthesizer.ts  # Ollama integration
├── memory/
│   └── projectMemory.ts      # JSONL-based workspace memory
├── security/
│   └── commandValidation.ts  # CLI command allowlist validation
└── settings/
    └── settings.ts           # Configuration accessor
```

## Commands

| Command | Description |
|---------|-------------|
| `Unified AI Council: Open` | Open the council sidebar |
| `Unified AI Council: Setup OAuth (WSL)` | Authenticate CLI tools |
| `Unified AI Council: Reset Project Memory` | Clear workspace memory |

## Security

- **Command Validation** — Only `codex`, `claude`, and `gemini` executables are allowed
- **Shell Injection Protection** — Metacharacters (`;`, `&`, `|`, backticks, `$()`) are rejected
- **CSP Nonces** — Webview scripts use cryptographic nonces
- **No External APIs** — All synthesis happens locally (CLIs use their own auth)

## Development

```bash
# Watch mode
npm run watch

# Run tests
npm run test

# Lint
npm run lint

# Package extension
npm run package
```

### Running in Development

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. The council sidebar appears in the Activity Bar

## Roadmap

- [ ] Cross-platform support (native CLI execution without WSL)
- [ ] Streaming responses
- [ ] Custom council member configurations
- [ ] Enhanced synthesis with voting mechanisms
- [ ] Telemetry and usage analytics (opt-in)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenAI Codex](https://openai.com/blog/openai-codex) for code generation capabilities
- [Anthropic Claude](https://anthropic.com) for reasoning and analysis
- [Google Gemini](https://deepmind.google/technologies/gemini/) for broad knowledge integration
