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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (typeof window === 'undefined') return;
                var reloadKey = 'ai-sport-coach-chunk-reload';
                var hasReloaded = sessionStorage.getItem(reloadKey) === '1';
                function reloadOnce() {
                  if (hasReloaded) return;
                  hasReloaded = true;
                  sessionStorage.setItem(reloadKey, '1');
                  window.location.reload();
                }
                window.addEventListener('load', function () {
                  sessionStorage.removeItem(reloadKey);
                });
                window.addEventListener('error', function (event) {
                  var message = String((event && event.message) || '');
                  var target = event && event.target;
                  var source = target && target.src ? String(target.src) : '';
                  if (message.indexOf('Loading chunk') >= 0 || source.indexOf('/_next/static/chunks/') >= 0) {
                    reloadOnce();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function (event) {
                  var reason = event && event.reason;
                  var message = String((reason && (reason.message || reason.toString && reason.toString())) || '');
                  if (message.indexOf('Loading chunk') >= 0 || message.indexOf('ChunkLoadError') >= 0) {
                    reloadOnce();
                  }
                });
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
