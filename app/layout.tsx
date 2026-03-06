import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "举重教练 - AI视频分析",
  description: "专业的举重和力量举训练视频分析工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
