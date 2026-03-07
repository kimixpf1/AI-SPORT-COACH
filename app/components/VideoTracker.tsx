'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

interface TrackingPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface TrackingData {
  trajectory: TrackingPoint[];
  velocityData: { time: number; velocity: number; acceleration: number }[];
}

interface VideoTrackerProps {
  videoUrl: string;
  onTrackingComplete?: (data: TrackingData) => void;
  onTrackingStart?: () => void;
  onTimeUpdate?: (time: number) => void;
}

export interface VideoTrackerRef {
  startTracking: () => Promise<void>;
}

const VideoTracker = forwardRef<VideoTrackerRef, VideoTrackerProps>(
  ({ videoUrl, onTrackingComplete, onTrackingStart, onTimeUpdate }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [trackingProgress, setTrackingProgress] = useState(0);

  // 初始化 OpenCV（仅在客户端）
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 检查是否已经加载
    // @ts-ignore
    if (window.cv && window.cv.Mat) {
      console.log('OpenCV.js 已加载');
      setCvReady(true);
      return;
    }

    // 检查是否正在加载
    // @ts-ignore
    if (window.cvLoadingPromise) {
      // @ts-ignore
      window.cvLoadingPromise.then(() => {
        console.log('OpenCV.js 加载完成（等待中）');
        setCvReady(true);
      });
      return;
    }

    const loadOpenCV = async () => {
      try {
        // 使用 jsDelivr CDN 加载 OpenCV.js（支持 CORS）
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.1/dist/opencv.js';
        script.async = true;

        // 创建加载 Promise
        // @ts-ignore
        window.cvLoadingPromise = new Promise((resolve, reject) => {
          script.onload = () => {
            // 等待 OpenCV 初始化完成
            // @ts-ignore
            if (window.cv && window.cv.Mat) {
              console.log('OpenCV.js 加载成功');
              setCvReady(true);
              resolve(true);
            } else {
              // OpenCV 需要时间初始化，设置轮询
              const checkInterval = setInterval(() => {
                // @ts-ignore
                if (window.cv && window.cv.Mat) {
                  clearInterval(checkInterval);
                  console.log('OpenCV.js 加载成功');
                  setCvReady(true);
                  resolve(true);
                }
              }, 100);

              // 10秒超时
              setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('OpenCV 初始化超时'));
              }, 10000);
            }
          };
          script.onerror = () => {
            console.error('OpenCV.js 加载失败');
            reject(new Error('OpenCV.js 加载失败'));
          };
        });

        document.body.appendChild(script);
      } catch (error) {
        console.error('OpenCV.js 初始化失败:', error);
      }
    };

    loadOpenCV();
  }, []);

  // 监听视频加载完成，初始化 canvas
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const handleLoadedMetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log('视频尺寸:', video.videoWidth, 'x', video.videoHeight);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoUrl]);

  // 监听视频时间更新
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time); // 通知父组件时间更新
      if (trackingData) {
        drawTrajectory(time);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [trackingData]);

  // 绘制轨迹
  const drawTrajectory = (currentTime: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !trackingData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布（不绘制视频帧，因为视频已经在下层显示）
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制轨迹
    const trajectory = trackingData.trajectory.filter(
      (point) => point.timestamp <= currentTime
    );

    if (trajectory.length > 1) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(trajectory[0].x, trajectory[0].y);

      for (let i = 1; i < trajectory.length; i++) {
        ctx.lineTo(trajectory[i].x, trajectory[i].y);
      }
      ctx.stroke();

      // 绘制当前位置点
      const currentPoint = trajectory[trajectory.length - 1];
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(currentPoint.x, currentPoint.y, 8, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  // 使用 OpenCV 检测单帧中的杠铃片
  const detectBarbellInFrame = (
    video: HTMLVideoElement,
    timestamp: number,
    previousPosition?: { x: number; y: number }
  ): { x: number; y: number } | null => {
    try {
      // @ts-ignore - OpenCV 从 CDN 加载，全局可用
      const cv = window.cv;
      if (!cv) {
        console.error('OpenCV 未加载');
        return null;
      }

      // 创建临时 canvas 获取当前帧
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0);

      // 获取 ImageData
      const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

      // 转换为 OpenCV Mat（正确的方式）
      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const circles = new cv.Mat();

      // 转灰度
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 高斯模糊减少噪声
      cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 2, 2);

      // Hough 圆检测（更严格的参数）
      cv.HoughCircles(
        blurred,
        circles,
        cv.HOUGH_GRADIENT,
        1,                    // dp: 累加器分辨率
        blurred.rows / 8,     // minDist: 圆心最小距离
        100,                  // param1: Canny边缘检测高阈值
        35,                   // param2: 累加器阈值（提高以减少误检）
        30,                   // minRadius: 最小半径（杠铃片通常较大）
        120                   // maxRadius: 最大半径
      );

      let bestCircle: { x: number; y: number; radius: number } | null = null;

      // 智能选择策略
      if (circles.cols > 0) {
        console.log(`检测到 ${circles.cols} 个圆`);

        const candidates: Array<{ x: number; y: number; radius: number; score: number }> = [];

        for (let i = 0; i < circles.cols; i++) {
          const x = circles.data32F[i * 3];
          const y = circles.data32F[i * 3 + 1];
          const radius = circles.data32F[i * 3 + 2];

          // 计算候选圆的得分
          let score = 0;

          // 1. 半径得分（杠铃片通常在 40-100 像素之间）
          if (radius >= 40 && radius <= 100) {
            score += 50;
          } else if (radius >= 30 && radius <= 120) {
            score += 30;
          } else {
            score += 10;
          }

          // 2. 位置得分（杠铃通常在画面中下部，y > height/3）
          if (y > tempCanvas.height / 3) {
            score += 30;
          }

          // 3. 连续性得分（如果有前一帧的位置，优先选择附近的圆）
          if (previousPosition) {
            const distance = Math.sqrt(
              Math.pow(x - previousPosition.x, 2) + Math.pow(y - previousPosition.y, 2)
            );
            // 距离越近得分越高（最大移动距离假设为 200 像素）
            if (distance < 200) {
              score += Math.max(0, 50 - distance / 4);
            }
          }

          candidates.push({ x, y, radius, score });
        }

        // 按得分排序，选择得分最高的
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
          const best = candidates[0];
          bestCircle = { x: best.x, y: best.y, radius: best.radius };
          console.log(`  选择最佳圆: 中心(${best.x.toFixed(0)}, ${best.y.toFixed(0)}), 半径=${best.radius.toFixed(0)}, 得分=${best.score.toFixed(0)}`);

          // 显示前3个候选
          for (let i = 0; i < Math.min(3, candidates.length); i++) {
            const c = candidates[i];
            console.log(`    候选 ${i + 1}: 中心(${c.x.toFixed(0)}, ${c.y.toFixed(0)}), 半径=${c.radius.toFixed(0)}, 得分=${c.score.toFixed(0)}`);
          }
        }
      } else {
        console.log('未检测到任何圆');
      }

      // 清理内存
      src.delete();
      gray.delete();
      blurred.delete();
      circles.delete();

      return bestCircle ? { x: bestCircle.x, y: bestCircle.y } : null;
    } catch (error) {
      console.error('检测帧失败:', error);
      return null;
    }
  };

  // 开始追踪
  const startTracking = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (!cvReady) {
      throw new Error('OpenCV.js 还未加载完成，请稍后再试');
    }

    setIsTracking(true);
    onTrackingStart?.();
    console.log('开始追踪杠铃...');

    try {
      const trajectory: TrackingPoint[] = [];
      const duration = video.duration;
      const frameCount = 30; // 采样30帧

      // 暂停视频
      video.pause();
      video.currentTime = 0;

      // 等待视频加载第一帧
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      console.log('开始逐帧检测...');

      // 逐帧检测
      for (let i = 0; i < frameCount; i++) {
        const t = (i / (frameCount - 1)) * duration;

        // 更新进度
        setTrackingProgress(Math.round(((i + 1) / frameCount) * 100));

        // 跳转到指定时间
        video.currentTime = t;
        await new Promise((resolve) => {
          video.onseeked = resolve;
        });

        // 检测当前帧（传递前一帧的位置以提高连续性）
        const previousPosition = trajectory.length > 0 ? trajectory[trajectory.length - 1] : undefined;
        const detection = detectBarbellInFrame(video, t, previousPosition);

        if (detection) {
          trajectory.push({
            x: detection.x,
            y: detection.y,
            timestamp: t,
          });
          console.log(`帧 ${i + 1}/${frameCount}: 检测到杠铃 (${detection.x.toFixed(0)}, ${detection.y.toFixed(0)})`);
        } else {
          console.log(`帧 ${i + 1}/${frameCount}: 未检测到杠铃`);
        }
      }

      setTrackingProgress(0);

      if (trajectory.length < 2) {
        alert('检测失败：未能检测到足够的杠铃位置。请确保视频中有清晰的圆形杠铃片。');
        setIsTracking(false);
        return;
      }

      console.log(`检测完成，共 ${trajectory.length} 个有效点`);

      // 计算速度和加速度
      const velocityData: { time: number; velocity: number; acceleration: number }[] = [];

      for (let i = 1; i < trajectory.length; i++) {
        const dt = trajectory[i].timestamp - trajectory[i - 1].timestamp;
        const dx = trajectory[i].x - trajectory[i - 1].x;
        const dy = trajectory[i].y - trajectory[i - 1].y;

        // 计算速度（像素/秒）
        const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

        if (i > 1) {
          const prevVelocity = velocityData[i - 2].velocity;
          const acceleration = (velocity - prevVelocity) / dt;
          velocityData.push({
            time: trajectory[i].timestamp,
            velocity,
            acceleration,
          });
        } else {
          velocityData.push({
            time: trajectory[i].timestamp,
            velocity,
            acceleration: 0,
          });
        }
      }

      const data: TrackingData = {
        trajectory,
        velocityData,
      };

      setTrackingData(data);
      onTrackingComplete?.(data);

      // 重置视频到开始
      video.currentTime = 0;

      console.log('追踪完成！');
    } catch (error) {
      console.error('追踪失败:', error);
      throw error; // 重新抛出错误，让调用者处理
    } finally {
      setIsTracking(false);
      setTrackingProgress(0);
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    startTracking,
  }));

  return (
    <div className="h-full flex flex-col">
      {/* 视频和画布叠加 */}
      <div className="relative flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="absolute inset-0 w-full h-full object-contain"
        />
        {/* Canvas 叠加在视频上方，用于绘制轨迹 */}
        {trackingData && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />
        )}
      </div>

      {/* 追踪进度条 */}
      {isTracking && (
        <div className="mt-4 flex-shrink-0">
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-green-600 h-full transition-all duration-300"
              style={{ width: `${trackingProgress}%` }}
            />
          </div>
          <p className="text-sm text-center mt-2 text-gray-600 dark:text-gray-400">
            追踪进度: {trackingProgress}%
          </p>
        </div>
      )}

      {/* 追踪信息 */}
      {trackingData && (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0">
          <p className="text-sm">
            追踪点数: {trackingData.trajectory.length} |
            当前时间: {currentTime.toFixed(2)}s |
            平均速度: {(trackingData.velocityData.reduce((sum, d) => sum + d.velocity, 0) / trackingData.velocityData.length).toFixed(2)} px/s
          </p>
        </div>
      )}

      {/* OpenCV 加载状态 */}
      {!cvReady && (
        <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-lg flex-shrink-0">
          <p className="text-sm">正在加载 OpenCV.js，请稍候...</p>
        </div>
      )}
    </div>
  );
});

VideoTracker.displayName = 'VideoTracker';

export default VideoTracker;
