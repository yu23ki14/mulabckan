import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "西粟倉村 オープンデータ AI Agent",
  description:
    "西粟倉村のCKANオープンデータポータルをAIが対話的に案内します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
