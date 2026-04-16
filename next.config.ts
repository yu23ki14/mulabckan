import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages do runtime imports of Node built-ins (fs/url) and ship
  // their own worker entrypoints. Let them resolve from node_modules at
  // runtime instead of letting Turbopack bundle them, which was breaking
  // pdf-parse's text extraction in the /api/chat route.
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "xlsx",
    "@napi-rs/canvas",
  ],
  // pdfjs-dist reads cmaps + standard_fonts from disk at runtime for
  // non-Latin PDFs (the 村道・林道位置図 has Japanese text). Next's file
  // tracer doesn't see these data files from the JS import graph, so we
  // force-include them in the /api/chat function on Vercel.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
};

export default nextConfig;
