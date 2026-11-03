/**
 * Insert `source` into the document as a classic script.
 *
 * This has to be a real script element rather than `eval`: the vendored app is 14 classic scripts
 * that share one global scope, and a browser evaluates a script element exactly that way, with
 * function declarations landing on `window`. It also avoids needing `unsafe-eval` in any CSP.
 *
 * Factored into its own module because the DOM shims used by the test runner do not evaluate
 * inline scripts, so the mount's test substitutes this single call and runs the real source.
 */
export function runClassicScript(source: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.dataset.d2d = 'app';
  script.textContent = source;
  document.head.appendChild(script);
  return script;
}
