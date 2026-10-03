import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  turbopack: { root: process.cwd() },
};
export default withEve(config);
