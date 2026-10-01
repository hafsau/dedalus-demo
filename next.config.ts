import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // MSW's browser entry deliberately doesn't resolve under the `node`
      // condition. Give the server bundle an inert stub instead.
      "msw/browser": {
        browser: "msw/browser",
        default: "./lib/sim/msw-browser-stub.ts",
      },
    },
  },
};

export default nextConfig;
