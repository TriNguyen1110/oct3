import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = { devIndicators: false };
export default withEve(config);
