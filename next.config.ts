import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs and generated images are written to .data/ on the server.
  // On Vercel this folder is temporary; see README "Storage" for the upgrade path.
  poweredByHeader: false,
};

export default nextConfig;
