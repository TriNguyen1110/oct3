import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  turbopack: { root: process.cwd() },
  // Playwright loads this small manifest through a dynamic require that
  // Next's deployment tracer cannot discover, including for remote CDP use.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/playwright-core/browsers.json"],
  },
};
export default withEve(config);
