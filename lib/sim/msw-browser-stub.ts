// Server-side stand-in for `msw/browser`, which only exists in browsers.
// The simulator starts inside a client effect, so this is never executed;
// it only lets the server bundle resolve the import graph.
export function setupWorker(): never {
  throw new Error("msw/browser is only available in the browser");
}
