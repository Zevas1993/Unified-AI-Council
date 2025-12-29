# Unified AI Council (VS Code Extension)

A single-chat VS Code extension that orchestrates **Codex CLI**, **Claude Code**, and **Gemini CLI** as a "council" and returns a consensus answer—**inside VS Code**, Cline-style.

## What this repo gives you

- **One chat UI** (Webview sidebar) with mode toggles: **Plan / Refactor / Debug / Act**
- **Council orchestration**: run 3 CLIs in parallel (via **WSL**) → collect outputs → synthesize
- **Per-workspace memory**: stored in `.unified-ai-council/` inside your project
- **OAuth-only**: the CLIs handle their own OAuth flows; this extension launches first-run setup terminals
- **No external APIs required** (works offline-ish except the CLIs themselves)

> Windows note: This extension runs the CLIs via `wsl.exe` so you can keep everything *contained in VS Code*.

---

## Quick start (dev)

1) Install prerequisites
- VS Code
- Node.js 18+ (20+ recommended)
- WSL installed (Ubuntu recommended)
- Each CLI installed *inside WSL*:
  - Codex CLI
  - Claude Code
  - Gemini CLI

2) Clone, install, build

```bash
npm install
npm run compile
```

3) Run the extension
- Open this folder in VS Code
- Press `F5` to launch an Extension Development Host
- Open the sidebar view: **Unified AI Council**

---

## One-time setup (OAuth)
In the sidebar UI, click **Setup** and follow prompts. This opens a VS Code terminal that runs the CLI in WSL so you can complete OAuth in place.

---

## Packaging
```bash
npm run package
```

---

## Repo layout
- `src/extension.ts` – extension activation + webview provider + command routing
- `src/orchestrator/*` – council router, modes, consensus, safety
- `src/cli/*` – WSL runner, streaming, timeouts, parsing
- `src/memory/*` – per-workspace memory store
- `webview/` – bundled UI (React-less, lightweight)

---

## License
MIT
