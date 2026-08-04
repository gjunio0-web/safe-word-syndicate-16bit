import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Deliberately small.
 *
 * This exists because of one bug class that nothing else here catches. The
 * type checker and the test suite both cover a lot of ground, but neither can
 * see a hook called behind a `&&` — the types are fine and every function does
 * what it says. React only complains at runtime, when the number of hooks it
 * sees changes between renders and it tears the tree down. That shipped once,
 * in a pause-menu condition written as `useIsMobileDevice() && !useIsPortrait()`,
 * and was caught by a human reading the diff rather than by any tool.
 *
 * The temptation with a first lint config is to turn everything on. Doing that
 * to a codebase that has never been linted produces a few hundred findings,
 * almost all of them stylistic, and the practical result is that people learn
 * to scroll past the output. A rule set nobody reads is worse than no rule set,
 * because it looks like coverage.
 *
 * So: hooks rules as errors, the handful of correctness rules from the
 * recommended set that are about genuine mistakes rather than taste, and
 * nothing else. Widening this later is cheap. Recovering trust in a wall of
 * warnings is not.
 */
export default tseslint.config(
  {
    // Build output and dependencies. Linting these finds nothing anyone can fix.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      /* ---- The reason this file exists ---- */

      // A hook behind a condition, a loop, or an early return. This is the one
      // that shipped. Error, never warning: there is no codebase state in which
      // a conditional hook call is acceptable and the failure mode is the whole
      // app going down.
      'react-hooks/rules-of-hooks': 'error',

      // A dependency array that does not match what the effect actually reads.
      // Warning rather than error, because the honest answer is sometimes "yes,
      // I meant to leave that out" — an effect that should run once, a ref that
      // never changes identity. Worth seeing every time; not worth blocking a
      // build over without a human looking.
      //
      // The four it currently reports are all of that kind. The clearest is
      // useMenuNavigation.ts:167, asking for `enabled` in the deps: at the only
      // call site `enabled` is derived from screen, isPaused and the modal
      // flags, and every one of those is already inside `scopeKey`, which is in
      // the deps. `enabled` cannot change without the effect re-running.
      //
      // Note where that argument lives, though: in the caller, not the hook. A
      // second caller deriving `enabled` from something outside `scopeKey`
      // would make this warning a real bug. Which is the case for keeping it
      // visible rather than silencing it with a disable comment.
      'react-hooks/exhaustive-deps': 'warn',

      /* ---- Turned down, and why ---- */

      // The codebase uses `any` in a few places where it is reading loosely
      // typed browser APIs, and each is a deliberate local decision rather than
      // laziness. Flagging them all on day one would bury the hooks findings.
      '@typescript-eslint/no-explicit-any': 'off',

      // Unused function arguments are frequently signature-driven — an event
      // handler that ignores its event, a callback matching an interface.
      // Underscore-prefixed names opt out explicitly.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Tests and build scripts run under Node and legitimately do things
    // application code should not — empty catch blocks probing for failure,
    // deliberate any-casts.
    //
    // Inert as written, and worth knowing before anyone relies on it. The
    // globals list is only ever consumed by `no-undef`, and typescript-eslint
    // switches that rule off because the type checker already covers it — so
    // it changes nothing for the .ts files. The .mjs scripts are not reached
    // by any block that carries rules (those are scoped to **/*.{ts,tsx}), so
    // they get parsed and nothing more: a syntax error surfaces, an undefined
    // call does not.
    //
    // Kept because it becomes real the moment rules are turned on for plain
    // JS, and because declaring the environment where it belongs is cheaper
    // than remembering to add it later. But do not read it as coverage.
    files: ['src/test/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
