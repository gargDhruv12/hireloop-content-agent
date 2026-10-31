import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runs and generated images are written to .data/ on the server.
  // On Vercel this folder is temporary; see README "Storage" for the upgrade path.
  poweredByHeader: false,
  turbopack: {
    // Pin the project root, so a stray lockfile in a parent folder isn't picked up.
    root: process.cwd(),
    // Tailwind, wired the same way as Content Studio.
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
