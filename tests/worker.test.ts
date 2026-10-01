// Guards a real bug: vitest ships its own msw@2, whose postinstall hook used
// to overwrite public/mockServiceWorker.js with a v2 worker on every install.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

describe("public/mockServiceWorker.js", () => {
  it("matches the installed msw version", () => {
    const worker = readFileSync(new URL("../public/mockServiceWorker.js", import.meta.url), "utf8");
    const version = /PACKAGE_VERSION = '([^']+)'/.exec(worker)?.[1];
    const installed = createRequire(import.meta.url)("msw/package.json").version;
    expect(version).toBe(installed);
  });
});
