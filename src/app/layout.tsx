import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "麻雀出欠ボード",
  description: "麻雀の出欠と開催可否をサクッと管理するWebアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
