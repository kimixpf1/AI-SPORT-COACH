'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TrackingData } from '@/lib/analysis-types';

interface VideoTrackerProps {
  videoUrl: string;
  trackingData: TrackingData | null;
  analyzing: boolean;
  progress: number;
  stageLabel: string;
  onTimeUpdate?: (time: number) => void;
}

const OVERLAY_EDGE_LIMIT = 1280;

function getOverlaySize(width: number, height: number) {
  const scale = Math.min(1, OVERLAY_EDGE_LIMIT / Math.max(width, height, 1));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaleX: Math.max(1, Math.round(width * scale)) / Math.max(width, 1),
    scaleY: Math.max(1, Math.round(height * scale)) / Math.max(height, 1),
  };
}

export default function VideoTracker({
  videoUrl,
  trackingData,
  analyzing,
  progress,
  stageLabel,
  onTimeUpdate,
}: VideoTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [overlayScale, setOverlayScale] = useState({ scaleX: 1, scaleY: 1 });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    const handleLoadedMetadata = () => {
      const overlaySize = getOverlaySize(video.videoWidth || 1280, video.videoHeight || 720);
      canvas.width = overlaySize.width;
      canvas.height = overlaySize.height;
      setOverlayScale({
        scaleX: overlaySize.scaleX,
        scaleY: overlaySize.scaleY,
      });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!trackingData || trackingData.trajectory.length < 2) {
      return;
    }

    const visiblePoints = trackingData.trajectory.filter((point) => point.timestamp <= currentTime);

    if (visiblePoints.length < 2) {
      return;
    }

    const sourceWidth = canvas.width || 1;
    const sourceHeight = canvas.height || 1;
    const scaleX = overlayScale.scaleX;
    const scaleY = overlayScale.scaleY;

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(sourceWidth, sourceHeight) / 220));
    ctx.beginPath();
    ctx.moveTo(visiblePoints[0].x * scaleX, visiblePoints[0].y * scaleY);

    visiblePoints.slice(1).forEach((point) => {
      ctx.lineTo(point.x * scaleX, point.y * scaleY);
    });

    ctx.stroke();

    const activePoint = visiblePoints[visiblePoints.length - 1];
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(
      activePoint.x * scaleX,
      activePoint.y * scaleY,
      Math.max(5, Math.round(Math.min(sourceWidth, sourceHeight) / 160)),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }, [currentTime, overlayScale, trackingData]);

  const summary = useMemo(() => {
    if (!trackingData || trackingData.velocityData.length === 0) {
      return null;
    }

    const averageVelocity =
      trackingData.velocityData.reduce((sum, item) => sum + item.velocity, 0) / trackingData.velocityData.length;
    const peakVelocity = trackingData.metricSummary.peakVelocity;

    return {
      points: trackingData.trajectory.length,
      averageVelocity: averageVelocity.toFixed(0),
      peakVelocity: peakVelocity.toFixed(0),
      label: trackingData.trajectoryLabel,
      angle: trackingData.captureAssessment.angleLabel,
      confidence: trackingData.captureAssessment.confidenceLabel,
    };
  }, [trackingData]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-black shadow-[0_18px_50px_rgba(2,6,23,0.45)]">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="aspect-video w-full object-contain"
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />

        {analyzing && (
          <div className="absolute inset-x-4 bottom-4 rounded-[22px] border border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between text-xs text-slate-200 sm:text-sm">
              <span>{stageLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">轨迹标签</p>
            <p className="mt-1 text-sm text-slate-200">{summary.label}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">机位判断</p>
            <p className="mt-1 text-sm text-slate-200">{summary.angle}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">识别可信度</p>
            <p className="mt-1 text-sm text-slate-200">{summary.confidence}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">轨迹点数</p>
            <p className="mt-1 text-sm text-slate-200">{summary.points}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">平均速度</p>
            <p className="mt-1 text-sm text-slate-200">{summary.averageVelocity} px/s</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">峰值速度</p>
            <p className="mt-1 text-sm text-slate-200">{summary.peakVelocity} px/s</p>
          </div>
        </div>
      )}
    </div>
  );
}
