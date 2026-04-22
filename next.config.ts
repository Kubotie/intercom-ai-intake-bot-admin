import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 複数 lockfile が存在する monorepo 環境での警告を抑制
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
