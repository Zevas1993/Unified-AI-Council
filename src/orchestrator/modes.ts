export type CouncilMode = 'plan' | 'refactor' | 'debug' | 'act';

export type CliRole = {
  systemRole: string;
  instruction: string;
};

export type ModeProfile = {
  name: CouncilMode;
  userFacingLabel: string;
  councilGoal: string;
  roles: { codex: CliRole; claude: CliRole; gemini: CliRole; };
  synthesis: {
    rubric: string;
    outputStyle: string;
    /** Optional extra structure constraints for the final response. */
    requiredSections?: string[];
    /** Optional disallowed content patterns for the final response. */
    bannedContent?: string[];
  };
};

export const MODE_PROFILES: Record<CouncilMode, ModeProfile> = {
  plan: {
    name: 'plan',
    userFacingLabel: 'Plan',
    councilGoal: 'Produce a clear plan with risks, tradeoffs, and checkpoints.',
    roles: {
      codex: { systemRole: 'Senior software architect.', instruction: 'Return a structured plan with milestones and tests.' },
      claude: { systemRole: 'Critical reviewer.', instruction: 'Challenge the plan; find missing requirements and risks.' },
      gemini: { systemRole: 'VS Code UX/devex specialist.', instruction: 'Make the plan implementable and smooth in VS Code.' }
    },
    synthesis: {
      rubric: 'Prefer specificity; resolve conflicts; state assumptions when needed.',
      outputStyle: 'Deliver: 1) Plan, 2) Risks, 3) Next actions.'
    }
  },
  refactor: {
    name: 'refactor',
    userFacingLabel: 'Refactor',
    councilGoal: 'Improve code with minimal behavior change; prioritize clarity and safety.',
    roles: {
      codex: { systemRole: 'Refactoring specialist.', instruction: 'Propose small safe refactors with verification.' },
      claude: { systemRole: 'Regression-avoidance reviewer.', instruction: 'Flag regression risks and add tests/checks.' },
      gemini: { systemRole: 'Extension best-practices guide.', instruction: 'Ensure changes match VS Code patterns.' }
    },
    synthesis: {
      rubric: 'Refactor in small steps with validation after each step.',
      outputStyle: 'Deliver: refactor steps + reasoning + verification checklist.'
    }
  },
  debug: {
    name: 'debug',
    userFacingLabel: 'Debug',
    councilGoal: 'Diagnose issues, propose root causes, and provide a reliable fix path.',
    roles: {
      codex: { systemRole: 'Debugger.', instruction: 'Use logs/repro; propose likely causes and concrete fixes.' },
      claude: { systemRole: 'Adversarial tester.', instruction: 'List failure modes, races, WSL pitfalls.' },
      gemini: { systemRole: 'Observability engineer.', instruction: 'Recommend diagnostics and better errors.' }
    },
    synthesis: {
      rubric: 'Prefer reproducibility and step-by-step confirmation.',
      outputStyle: 'Deliver: suspected causes, how to confirm, fix steps.'
    }
  },
  act: {
    name: 'act',
    userFacingLabel: 'Act',
    councilGoal: 'Produce actionable outputs: code, commands, and verification steps.',
    roles: {
      codex: { systemRole: 'Builder.', instruction: 'Provide runnable code with file paths and commands.' },
      claude: { systemRole: 'Security/correctness reviewer.', instruction: 'Double-check safety, correctness, and edge cases.' },
      gemini: { systemRole: 'Integration engineer.', instruction: 'Ensure commands work in WSL/VS Code; note quirks.' }
    },
    synthesis: {
      rubric: 'Output must be directly usable; prefer precise paths/commands.',
      outputStyle: 'Deliver: implementation steps + code snippets + verification.'
    }
  }
};
