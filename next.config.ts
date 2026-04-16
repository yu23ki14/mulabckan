import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages do runtime imports of Node built-ins (fs/url) and ship
  // their own worker entrypoints. Let them resolve from node_modules at
  // runtime instead of letting Turbopack bundle them, which was breaking
  // pdf-parse's text extraction in the /api/chat route.
  serverExternalPackages: ["pdf-parse", "xlsx", "@napi-rs/canvas"],
};

export default nextConfig;
