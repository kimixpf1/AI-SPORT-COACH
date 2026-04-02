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

                if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
                  crypto.randomUUID = function () {
                    return 'history-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
                  };
                }

                function rewriteMediaPipeUrl(value) {
                  if (typeof value !== 'string') return value;
                  return value
                    .replace(
                      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm',
                      'https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
                    )
                    .replace(
                      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
                      'https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
                    );
                }

                try {
                  var historyKey = 'ai-sport-coach-history';
                  var rawHistory = window.localStorage.getItem(historyKey);
                  if (rawHistory) {
                    var parsedHistory = JSON.parse(rawHistory);
                    if (Array.isArray(parsedHistory)) {
                      var normalizedHistory = parsedHistory
                        .filter(function (item) {
                          return item && typeof item === 'object' && typeof item.videoFileName === 'string' && typeof item.exerciseType === 'string';
                        })
                        .map(function (item) {
                          return {
                            id: typeof item.id === 'string' && item.id ? item.id : 'history-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
                            createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
                            videoFileName: item.videoFileName,
                            exerciseType: item.exerciseType,
                            overallScore: typeof item.overallScore === 'number' ? item.overallScore : 0,
                            analysisMode: typeof item.analysisMode === 'string' ? item.analysisMode : 'MediaPipe 本地分析',
                            suggestions: Array.isArray(item.suggestions)
                              ? item.suggestions.filter(function (entry) {
                                  return typeof entry === 'string';
                                })
                              : [],
                          };
                        })
                        .slice(0, 12);
                      window.localStorage.setItem(historyKey, JSON.stringify(normalizedHistory));
                    } else {
                      window.localStorage.removeItem(historyKey);
                    }
                  }
                } catch {}

                var canvasWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
                var canvasHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
                var canvasEdgeLimit = 1280;
                if (canvasWidthDescriptor && canvasWidthDescriptor.set && canvasHeightDescriptor && canvasHeightDescriptor.set) {
                  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
                    configurable: true,
                    enumerable: canvasWidthDescriptor.enumerable,
                    get: canvasWidthDescriptor.get,
                    set: function (value) {
                      var safeValue = Number(value);
                      if (Number.isFinite(safeValue) && safeValue > canvasEdgeLimit) {
                        safeValue = canvasEdgeLimit;
                      }
                      canvasWidthDescriptor.set.call(this, safeValue);
                    },
                  });
                  Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
                    configurable: true,
                    enumerable: canvasHeightDescriptor.enumerable,
                    get: canvasHeightDescriptor.get,
                    set: function (value) {
                      var safeValue = Number(value);
                      if (Number.isFinite(safeValue) && safeValue > canvasEdgeLimit) {
                        safeValue = canvasEdgeLimit;
                      }
                      canvasHeightDescriptor.set.call(this, safeValue);
                    },
                  });
                }

                var mediaCurrentTimeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
                if (mediaCurrentTimeDescriptor && mediaCurrentTimeDescriptor.set) {
                  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
                    configurable: true,
                    enumerable: mediaCurrentTimeDescriptor.enumerable,
                    get: mediaCurrentTimeDescriptor.get,
                    set: function (value) {
                      var duration = Number(this.duration || 0);
                      var safeValue = Number(value);
                      if (Number.isFinite(duration) && duration > 0.1 && Number.isFinite(safeValue)) {
                        safeValue = Math.min(Math.max(safeValue, 0), Math.max(duration - 0.05, 0));
                      }
                      mediaCurrentTimeDescriptor.set.call(this, safeValue);
                    },
                  });
                }

                var scriptSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
                if (scriptSrcDescriptor && scriptSrcDescriptor.set) {
                  Object.defineProperty(HTMLScriptElement.prototype, 'src', {
                    configurable: true,
                    enumerable: scriptSrcDescriptor.enumerable,
                    get: scriptSrcDescriptor.get,
                    set: function (value) {
                      scriptSrcDescriptor.set.call(this, rewriteMediaPipeUrl(String(value)));
                    },
                  });
                }

                var originalSetAttribute = Element.prototype.setAttribute;
                Element.prototype.setAttribute = function (name, value) {
                  if (this && this.tagName === 'SCRIPT' && String(name).toLowerCase() === 'src') {
                    return originalSetAttribute.call(this, name, rewriteMediaPipeUrl(String(value)));
                  }
                  return originalSetAttribute.call(this, name, value);
                };

                var originalFetch = window.fetch;
                if (typeof originalFetch === 'function') {
                  window.fetch = function (input, init) {
                    if (typeof input === 'string') {
                      return originalFetch.call(this, rewriteMediaPipeUrl(input), init);
                    }
                    if (input && typeof input.url === 'string') {
                      return originalFetch.call(this, rewriteMediaPipeUrl(input.url), init);
                    }
                    return originalFetch.call(this, input, init);
                  };
                }

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
