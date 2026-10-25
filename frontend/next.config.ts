import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Emit a minimal, self-contained production build at `.next/standalone`
  // (includes a `server.js` and only the required `node_modules`). This keeps
  // the production Docker image small — no `pnpm install` needed at runtime.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
