import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 运动教练",
  description: "基于 MediaPipe 的健身训练视频分析工具，支持微信手机端和桌面端复盘",
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
