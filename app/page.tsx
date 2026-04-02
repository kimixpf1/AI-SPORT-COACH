'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import VideoTracker from './components/VideoTracker';
import VelocityChart from './components/VelocityChart';
import { ExerciseProfile, HistoryItem, TrackingData, VideoAnalysisResult } from '@/lib/analysis-types';
import { analyzeVideoLocally } from '@/lib/pose-analysis';

const STORAGE_KEY = 'ai-sport-coach-history';
const VIDEO_INPUT_ID = 'training-video-input';
const EXERCISE_SELECT_ID = 'exercise-profile-select';

const exerciseOptions: Array<{ value: ExerciseProfile; label: string }> = [
  { value: 'auto', label: '自动识别' },
  { value: 'squat', label: '深蹲' },
  { value: 'bench_press', label: '卧推' },
  { value: 'clean', label: '高翻' },
  { value: 'deadlift', label: '硬拉' },
  { value: 'other', label: '其他力量动作' },
];

const DEFAULT_CAPTURE_ASSESSMENT: TrackingData['captureAssessment'] = {
  angleLabel: '机位待识别',
  clarityLabel: '待识别',
  resolutionLabel: '待识别',
  confidenceLabel: '待识别',
  detectedFrameRatio: 0,
  visibilityScore: 0,
  coverageScore: 0,
  warnings: [],
};

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeCaptureAssessment(value: unknown): TrackingData['captureAssessment'] {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CAPTURE_ASSESSMENT;
  }

  const nextValue = value as Partial<TrackingData['captureAssessment']>;

  return {
    angleLabel: typeof nextValue.angleLabel === 'string' ? nextValue.angleLabel : DEFAULT_CAPTURE_ASSESSMENT.angleLabel,
    clarityLabel:
      typeof nextValue.clarityLabel === 'string' ? nextValue.clarityLabel : DEFAULT_CAPTURE_ASSESSMENT.clarityLabel,
    resolutionLabel:
      typeof nextValue.resolutionLabel === 'string'
        ? nextValue.resolutionLabel
        : DEFAULT_CAPTURE_ASSESSMENT.resolutionLabel,
    confidenceLabel:
      typeof nextValue.confidenceLabel === 'string'
        ? nextValue.confidenceLabel
        : DEFAULT_CAPTURE_ASSESSMENT.confidenceLabel,
    detectedFrameRatio:
      typeof nextValue.detectedFrameRatio === 'number' ? nextValue.detectedFrameRatio : DEFAULT_CAPTURE_ASSESSMENT.detectedFrameRatio,
    visibilityScore:
      typeof nextValue.visibilityScore === 'number' ? nextValue.visibilityScore : DEFAULT_CAPTURE_ASSESSMENT.visibilityScore,
    coverageScore:
      typeof nextValue.coverageScore === 'number' ? nextValue.coverageScore : DEFAULT_CAPTURE_ASSESSMENT.coverageScore,
    warnings: toStringArray(nextValue.warnings),
  };
}

function normalizeTrackingData(value: unknown): TrackingData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const nextValue = value as Partial<TrackingData>;

  return {
    trajectory: Array.isArray(nextValue.trajectory)
      ? nextValue.trajectory.filter(
          (item): item is TrackingData['trajectory'][number] =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.x === 'number' &&
            typeof item.y === 'number' &&
            typeof item.timestamp === 'number'
        )
      : [],
    velocityData: Array.isArray(nextValue.velocityData)
      ? nextValue.velocityData.filter(
          (item): item is TrackingData['velocityData'][number] =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.time === 'number' &&
            typeof item.velocity === 'number' &&
            typeof item.acceleration === 'number'
        )
      : [],
    poseMetrics: Array.isArray(nextValue.poseMetrics)
      ? nextValue.poseMetrics.filter(
          (item): item is TrackingData['poseMetrics'][number] =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.timestamp === 'number' &&
            typeof item.kneeAngle === 'number' &&
            typeof item.hipAngle === 'number' &&
            typeof item.elbowAngle === 'number' &&
            typeof item.torsoLean === 'number' &&
            typeof item.shoulderTilt === 'number' &&
            typeof item.hipTilt === 'number' &&
            typeof item.kneeTrackOffset === 'number'
        )
      : [],
    sampleCount: typeof nextValue.sampleCount === 'number' ? nextValue.sampleCount : 0,
    detectedFrames: typeof nextValue.detectedFrames === 'number' ? nextValue.detectedFrames : 0,
    trajectoryLabel: typeof nextValue.trajectoryLabel === 'string' ? nextValue.trajectoryLabel : '动作主轨迹',
    highlights: Array.isArray(nextValue.highlights)
      ? nextValue.highlights.filter(
          (item): item is TrackingData['highlights'][number] =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof item.title === 'string' &&
            typeof item.detail === 'string' &&
            typeof item.timestamp === 'number'
        )
      : [],
    metricSummary:
      nextValue.metricSummary && typeof nextValue.metricSummary === 'object'
        ? {
            peakVelocity:
              typeof nextValue.metricSummary.peakVelocity === 'number' ? nextValue.metricSummary.peakVelocity : 0,
            peakAcceleration:
              typeof nextValue.metricSummary.peakAcceleration === 'number' ? nextValue.metricSummary.peakAcceleration : 0,
            verticalRange:
              typeof nextValue.metricSummary.verticalRange === 'number' ? nextValue.metricSummary.verticalRange : 0,
            horizontalDrift:
              typeof nextValue.metricSummary.horizontalDrift === 'number' ? nextValue.metricSummary.horizontalDrift : 0,
            averageTorsoLean:
              typeof nextValue.metricSummary.averageTorsoLean === 'number' ? nextValue.metricSummary.averageTorsoLean : 0,
          }
        : {
            peakVelocity: 0,
            peakAcceleration: 0,
            verticalRange: 0,
            horizontalDrift: 0,
            averageTorsoLean: 0,
          },
    captureAssessment: normalizeCaptureAssessment(nextValue.captureAssessment),
  };
}

function normalizeAnalysisResult(value: unknown, fallbackExerciseLabel: string): VideoAnalysisResult {
  if (!value || typeof value !== 'object') {
    return {
      exerciseType: fallbackExerciseLabel,
      analysisMode: 'MediaPipe 本地分析',
      captureAssessment: DEFAULT_CAPTURE_ASSESSMENT,
      trajectoryAnalysis: {
        barPath: '当前结果结构不完整，建议重新分析或刷新页面后重试。',
        keyPoints: [],
        deviations: '本次结果未返回完整轨迹解释。',
      },
      velocityAnalysis: {
        phases: [],
        criticalMoments: '本次结果未返回完整速度节奏信息。',
      },
      postureAnalysis: {
        stability: { score: 0, issues: [] },
        rangeOfMotion: { score: 0, notes: '本次结果未返回完整动作幅度结论。' },
        bodyAlignment: { score: 0, issues: [] },
      },
      overallScore: 0,
      suggestions: ['请刷新页面后重新分析；如果问题重复出现，优先重新上传原始视频。'],
      strengths: [],
      risks: [],
    };
  }

  const nextValue = value as Partial<VideoAnalysisResult>;

  return {
    exerciseType: typeof nextValue.exerciseType === 'string' ? nextValue.exerciseType : fallbackExerciseLabel,
    analysisMode: typeof nextValue.analysisMode === 'string' ? nextValue.analysisMode : 'MediaPipe 本地分析',
    captureAssessment: normalizeCaptureAssessment(nextValue.captureAssessment),
    trajectoryAnalysis:
      nextValue.trajectoryAnalysis && typeof nextValue.trajectoryAnalysis === 'object'
        ? {
            barPath:
              typeof nextValue.trajectoryAnalysis.barPath === 'string'
                ? nextValue.trajectoryAnalysis.barPath
                : '本次结果未返回完整轨迹描述。',
            keyPoints: toStringArray(nextValue.trajectoryAnalysis.keyPoints),
            deviations:
              typeof nextValue.trajectoryAnalysis.deviations === 'string'
                ? nextValue.trajectoryAnalysis.deviations
                : '本次结果未返回完整偏移说明。',
          }
        : {
            barPath: '本次结果未返回完整轨迹描述。',
            keyPoints: [],
            deviations: '本次结果未返回完整偏移说明。',
          },
    velocityAnalysis:
      nextValue.velocityAnalysis && typeof nextValue.velocityAnalysis === 'object'
        ? {
            phases: Array.isArray(nextValue.velocityAnalysis.phases)
              ? nextValue.velocityAnalysis.phases.filter(
                  (item): item is VideoAnalysisResult['velocityAnalysis']['phases'][number] =>
                    Boolean(item) &&
                    typeof item === 'object' &&
                    typeof item.phase === 'string' &&
                    typeof item.velocity === 'string' &&
                    typeof item.acceleration === 'string'
                )
              : [],
            criticalMoments:
              typeof nextValue.velocityAnalysis.criticalMoments === 'string'
                ? nextValue.velocityAnalysis.criticalMoments
                : '本次结果未返回完整节奏结论。',
          }
        : {
            phases: [],
            criticalMoments: '本次结果未返回完整节奏结论。',
          },
    postureAnalysis:
      nextValue.postureAnalysis && typeof nextValue.postureAnalysis === 'object'
        ? {
            stability: {
              score:
                typeof nextValue.postureAnalysis.stability?.score === 'number'
                  ? nextValue.postureAnalysis.stability.score
                  : 0,
              issues: toStringArray(nextValue.postureAnalysis.stability?.issues),
            },
            rangeOfMotion: {
              score:
                typeof nextValue.postureAnalysis.rangeOfMotion?.score === 'number'
                  ? nextValue.postureAnalysis.rangeOfMotion.score
                  : 0,
              notes:
                typeof nextValue.postureAnalysis.rangeOfMotion?.notes === 'string'
                  ? nextValue.postureAnalysis.rangeOfMotion.notes
                  : '本次结果未返回完整动作幅度结论。',
            },
            bodyAlignment: {
              score:
                typeof nextValue.postureAnalysis.bodyAlignment?.score === 'number'
                  ? nextValue.postureAnalysis.bodyAlignment.score
                  : 0,
              issues: toStringArray(nextValue.postureAnalysis.bodyAlignment?.issues),
            },
          }
        : {
            stability: { score: 0, issues: [] },
            rangeOfMotion: { score: 0, notes: '本次结果未返回完整动作幅度结论。' },
            bodyAlignment: { score: 0, issues: [] },
          },
    overallScore: typeof nextValue.overallScore === 'number' ? nextValue.overallScore : 0,
    suggestions: toStringArray(nextValue.suggestions),
    strengths: toStringArray(nextValue.strengths),
    risks: toStringArray(nextValue.risks),
  };
}

function normalizeHistoryItem(value: unknown): HistoryItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Partial<HistoryItem>;

  if (typeof item.videoFileName !== 'string' || typeof item.exerciseType !== 'string') {
    return null;
  }

  return {
    id: typeof item.id === 'string' && item.id.length > 0 ? item.id : createHistoryId(),
    createdAt:
      typeof item.createdAt === 'string' && item.createdAt.length > 0 ? item.createdAt : new Date().toISOString(),
    videoFileName: item.videoFileName,
    exerciseType: item.exerciseType,
    overallScore: typeof item.overallScore === 'number' ? item.overallScore : 0,
    analysisMode: typeof item.analysisMode === 'string' ? item.analysisMode : 'MediaPipe 本地分析',
    suggestions: Array.isArray(item.suggestions)
      ? item.suggestions.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

function readStoredHistory() {
  if (typeof window === 'undefined') {
    return [];
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeHistoryItem(item))
      .filter((item): item is HistoryItem => Boolean(item))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function createHistoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getAnalysisErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '分析失败，请更换更清晰的视频重试';
  }

  const message = error.message;

  if (message.includes('ROI width and height must be > 0')) {
    return '当前视频部分抽帧在解码阶段出现异常，系统已跳过无效帧。请重新尝试分析；如果仍失败，建议优先使用原始导出视频或避免在视频首尾裁切得过短。';
  }

  if (message.includes('client-side exception')) {
    return '分析结果渲染时发生异常，请刷新页面后重试。';
  }

  return message;
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseProfile>('auto');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState('等待上传视频');
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setHistory(readStoredHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const latestHistory = useMemo(() => history.slice(0, 6), [history]);
  const selectedExerciseLabel = useMemo(
    () => exerciseOptions.find((option) => option.value === selectedExercise)?.label ?? '自动识别',
    [selectedExercise]
  );

  const handlePickVideo = () => {
    const input = fileInputRef.current;

    if (!input || analyzing) {
      return;
    }

    input.value = '';
    input.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);
    setTrackingData(null);
    setCurrentTime(0);
    setAnalysisProgress(0);
    setAnalysisStage('视频已就绪，等待开始分析');

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoUrl(URL.createObjectURL(selectedFile));
  };

  const persistHistory = (nextItem: HistoryItem) => {
    try {
      const nextHistory = [nextItem, ...history]
        .map((item) => normalizeHistoryItem(item))
        .filter((item): item is HistoryItem => Boolean(item))
        .slice(0, 12);
      setHistory(nextHistory);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
      }
    } catch {}
  };

  const handleAnalyze = async () => {
    const activeFile = file ?? fileInputRef.current?.files?.[0] ?? null;

    if (!activeFile) {
      setError('请先上传训练视频');
      return;
    }

    if (!file && activeFile) {
      setFile(activeFile);
      if (!videoUrl) {
        setVideoUrl(URL.createObjectURL(activeFile));
      }
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setTrackingData(null);
    setAnalysisProgress(0);
    setAnalysisStage('正在准备 MediaPipe 模型');

    try {
      const { result: nextResult, trackingData: nextTrackingData } = await analyzeVideoLocally(
        activeFile,
        selectedExercise,
        (progress, stage) => {
          setAnalysisProgress(progress);
          setAnalysisStage(stage);
        }
      );

      const safeResult = normalizeAnalysisResult(nextResult, selectedExerciseLabel);
      const safeTrackingData = normalizeTrackingData(nextTrackingData);

      setResult(safeResult);
      setTrackingData(safeTrackingData);
      setShowHistory(true);

      persistHistory({
        id: createHistoryId(),
        createdAt: new Date().toISOString(),
        videoFileName: activeFile.name,
        exerciseType: safeResult.exerciseType,
        overallScore: safeResult.overallScore,
        analysisMode: safeResult.analysisMode,
        suggestions: safeResult.suggestions,
      });

      setAnalysisStage('分析完成，可以复盘图表和建议');
      setAnalysisProgress(100);
    } catch (err) {
      setError(getAnalysisErrorMessage(err));
      setAnalysisStage('分析失败，请重新上传或调整拍摄角度');
    } finally {
      setAnalyzing(false);
    }
  };

  const heroStats = [
    ['运行模式', 'MediaPipe 本地分析'],
    ['机位覆盖', '正面 / 侧面 / 侧后方 / 后方'],
    ['上传状态', file ? '视频已就绪' : '等待导入'],
    ['当前动作', selectedExerciseLabel],
  ] as const;

  const intakeTips = [
    ['01', '已知动作优先手动选择，识别更稳。'],
    ['02', '动作开始前预留约 1 秒静止画面。'],
    ['03', '正面看对称性，后方看膝髋脚对线。'],
  ] as const;

  const workspaceStats = [
    ['当前动作', result?.exerciseType ?? selectedExerciseLabel],
    ['分析阶段', analyzing ? '识别中' : result ? '已完成' : '待开始'],
    ['有效姿态帧', trackingData ? `${trackingData.detectedFrames}/${trackingData.sampleCount}` : '--'],
  ] as const;

  const desktopHeaderCards = [
    ['导入视频', '支持微信、手机相册与电脑本地视频'],
    ['开始分析', '完成识别后直接查看图表与建议'],
  ] as const;

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-[1760px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,15,30,0.96),rgba(29,78,216,0.18))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] sm:p-6">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-3">
                <span className="inline-flex w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium tracking-[0.18em] text-cyan-200 uppercase">
                  Motion Analysis Studio
                </span>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">AI 运动教练</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">上传视频，开始分析，直接查看轨迹、图表和建议。</p>
                  </div>
                  <div className="hidden gap-2 sm:grid sm:grid-cols-2 xl:w-[360px]">
                    {desktopHeaderCards.map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
                        <p className="mt-2 text-sm text-slate-100">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {heroStats.map(([label, value], index) => (
                  <div
                    key={label}
                    className={`rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur ${index > 1 ? 'hidden md:block' : ''}`}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
                    <p className="mt-2 text-sm font-medium text-slate-100 sm:text-base">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="space-y-6 xl:sticky xl:top-5">
            <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">上传与分析</h2>
                </div>
                <button
                  onClick={() => setShowHistory((value) => !value)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-white/[0.06]"
                >
                  {showHistory ? '收起记录' : '最近记录'}
                </button>
              </div>

              <div className="mt-5 rounded-[28px] border border-cyan-400/25 bg-gradient-to-br from-cyan-400/10 via-slate-950/70 to-slate-950/90 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-cyan-100">导入训练视频</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">支持微信、iPhone、安卓与电脑本地视频。</p>
                  </div>
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                    浏览器本地分析
                  </div>
                </div>

                <input
                  id={VIDEO_INPUT_ID}
                  name="training-video"
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handlePickVideo}
                    disabled={analyzing}
                    className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(34,211,238,0.28)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                  >
                    导入训练视频
                  </button>
                  <label
                    htmlFor={VIDEO_INPUT_ID}
                    className="flex min-h-12 cursor-pointer items-center justify-center whitespace-nowrap rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/30 hover:bg-slate-950"
                  >
                    微信快速上传
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">建议全身尽量入镜</span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">支持后方深蹲视频</span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1">微信内也可直接导入</span>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  {file ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-100">{file.name}</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500">文件大小</p>
                          <p className="mt-1 text-sm text-slate-200">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">目标动作</p>
                          <p className="mt-1 text-sm text-slate-200">{selectedExerciseLabel}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">当前状态</p>
                          <p className="mt-1 text-sm text-slate-200">{analyzing ? '分析中' : '待开始'}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-100">等待载入训练视频</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">导入后即可开始分析。</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
                <label className="block">
                  <span className="mb-3 block text-sm font-medium text-slate-100">动作类型</span>
                  <select
                    id={EXERCISE_SELECT_ID}
                    name="exercise-profile"
                    value={selectedExercise}
                    onChange={(event) => setSelectedExercise(event.target.value as ExerciseProfile)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/40"
                  >
                    {exerciseOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  {intakeTips.map(([index, item]) => (
                    <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-[11px] font-semibold text-cyan-200">
                        {index}
                      </span>
                      <div>{item}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full whitespace-nowrap rounded-[22px] bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 px-4 py-3.5 text-base font-semibold text-slate-950 shadow-[0_18px_45px_rgba(34,211,238,0.25)] transition hover:translate-y-[-1px] hover:from-cyan-300 hover:to-indigo-300 disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-300"
                >
                  {analyzing ? '正在分析视频…' : '开始姿态分析'}
                </button>

                <div className="rounded-[22px] border border-white/10 bg-slate-950/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">分析进度</span>
                    <span className="shrink-0 text-sm text-slate-300">{analysisProgress}%</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span className="truncate">{analysisStage}</span>
                    <span className="shrink-0">{analyzing ? '处理中' : '等待开始'}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-[22px] border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-200">
                    {error}
                  </div>
                )}
              </div>

              {(file || videoUrl) && (
                <div className="mt-4 rounded-[22px] border border-cyan-400/20 bg-cyan-500/10 p-4 sm:hidden">
                  <p className="text-sm font-medium text-cyan-100">手机端快捷提示</p>
                  <p className="mt-2 text-xs leading-5 text-cyan-50/90">
                    如果微信里选完视频后按钮仍未变化，直接点“开始本地分析”，系统会再次从文件框读取视频。
                  </p>
                </div>
              )}
            </div>

            {showHistory && (
              <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">最近分析记录</h2>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {latestHistory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/70 p-4 text-sm text-slate-500">
                      暂无历史记录，先上传一段训练视频开始第一轮复盘。
                    </div>
                  ) : (
                    latestHistory.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-base font-medium text-slate-100">{item.exerciseType}</p>
                            <p className="mt-1 text-sm text-slate-400">{item.videoFileName}</p>
                            <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('zh-CN')}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-lg font-semibold text-cyan-300">{item.overallScore}/10</p>
                            <p className="text-xs text-slate-400">{item.analysisMode}</p>
                          </div>
                        </div>
                        {item.suggestions?.[0] && (
                          <p className="mt-3 text-sm leading-6 text-slate-300">下次优先改进：{item.suggestions[0]}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">视频工作台</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {workspaceStats.map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="mt-2 text-sm font-medium text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                {videoUrl ? (
                  <VideoTracker
                    videoUrl={videoUrl}
                    trackingData={trackingData}
                    analyzing={analyzing}
                    progress={analysisProgress}
                    stageLabel={analysisStage}
                    onTimeUpdate={setCurrentTime}
                  />
                ) : (
                  <div className="flex h-[320px] flex-col items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-slate-950/70 px-6 text-center">
                    <p className="text-base font-medium text-slate-200">等待视频进入工作台</p>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">导入视频后在这里查看预览、轨迹和结果。</p>
                  </div>
                )}
              </div>
            </div>

            {trackingData && trackingData.velocityData.length > 0 && (
              <VelocityChart data={trackingData.velocityData} currentTime={currentTime} />
            )}

            {trackingData && (
              <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">关键姿态指标</h2>
                  </div>
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                    MediaPipe 识别结果
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['峰值速度', `${trackingData.metricSummary.peakVelocity.toFixed(0)} px/s`],
                    ['峰值加速度', `${trackingData.metricSummary.peakAcceleration.toFixed(0)} px/s²`],
                    ['垂直位移', `${trackingData.metricSummary.verticalRange.toFixed(0)} px`],
                    ['平均躯干前倾', `${trackingData.metricSummary.averageTorsoLean.toFixed(0)}°`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[22px] border border-white/10 bg-slate-950/70 p-4">
                      <p className="text-sm text-slate-400">{label}</p>
                      <p className="mt-2 text-xl font-semibold text-slate-100 sm:text-2xl">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['拍摄角度', trackingData.captureAssessment.angleLabel],
                    ['视频清晰度', trackingData.captureAssessment.clarityLabel],
                    ['视频分辨率', trackingData.captureAssessment.resolutionLabel],
                    ['识别可信度', trackingData.captureAssessment.confidenceLabel],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-[22px] border border-white/10 bg-slate-950/70 p-4">
                      <p className="text-sm text-slate-400">{label}</p>
                      <p className="mt-2 text-base font-semibold text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">前后漂移</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-100">
                      {trackingData.metricSummary.horizontalDrift.toFixed(0)} px
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">动作时间线</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      {trackingData.highlights.map((item) => (
                        <div key={`${item.title}-${item.timestamp}`} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-100">{item.title}</p>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                              {item.timestamp.toFixed(2)} 秒
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {trackingData.captureAssessment.warnings.length > 0 && (
                  <div className="mt-4 rounded-[24px] border border-amber-400/20 bg-amber-500/10 p-4">
                    <h3 className="text-lg font-semibold text-amber-100">识别条件提醒</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-50">
                      {trackingData.captureAssessment.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
              {result ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="space-y-5">
                    <div className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-2xl font-semibold text-slate-50">{result.exerciseType}</p>
                          <p className="mt-2 text-sm text-cyan-300">{result.analysisMode}</p>
                        </div>
                        <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-6 py-5 text-center">
                          <p className="text-sm text-emerald-200">综合评分</p>
                          <p className="mt-1 text-4xl font-semibold text-emerald-300">{result.overallScore}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        ['稳定性', result.postureAnalysis.stability.score],
                        ['动作幅度', result.postureAnalysis.rangeOfMotion.score],
                        ['身体对齐', result.postureAnalysis.bodyAlignment.score],
                      ].map(([label, score]) => (
                        <div key={label} className="rounded-[22px] border border-white/10 bg-slate-950/80 p-4">
                          <p className="text-sm text-slate-400">{label}</p>
                          <p className="mt-2 text-3xl font-semibold text-cyan-300">{score}/10</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4">
                      <h3 className="text-lg font-semibold text-white">拍摄与识别评估</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {[
                          ['机位判断', result.captureAssessment.angleLabel],
                          ['识别可信度', result.captureAssessment.confidenceLabel],
                          ['关键点可见性', `${result.captureAssessment.visibilityScore}%`],
                          ['主体覆盖度', `${result.captureAssessment.coverageScore}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            <p className="text-sm text-slate-400">{label}</p>
                            <p className="mt-2 text-base font-semibold text-slate-100">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-[24px] border border-white/10 bg-slate-950/80 p-4">
                      <h3 className="text-lg font-semibold text-white">轨迹分析</h3>
                      <p className="text-sm leading-6 text-slate-300">{result.trajectoryAnalysis.barPath}</p>
                      <div className="space-y-2 text-sm text-slate-300">
                        {result.trajectoryAnalysis.keyPoints.map((point) => (
                          <div key={point} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                            {point}
                          </div>
                        ))}
                      </div>
                      <p className="text-sm leading-6 text-slate-400">{result.trajectoryAnalysis.deviations}</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-4 rounded-[24px] border border-white/10 bg-slate-950/80 p-4">
                      <h3 className="text-lg font-semibold text-white">速度与节奏</h3>
                      <div className="space-y-3">
                        {result.velocityAnalysis.phases.map((phase) => (
                          <div key={phase.phase} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            <p className="font-medium text-slate-100">{phase.phase}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-300">速度：{phase.velocity}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-400">加速度：{phase.acceleration}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm leading-6 text-slate-300">{result.velocityAnalysis.criticalMoments}</p>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4">
                      <h3 className="text-lg font-semibold text-white">姿态重点</h3>
                      <div className="mt-4 grid gap-4">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="font-medium text-slate-100">稳定性观察</p>
                          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                            {result.postureAnalysis.stability.issues.length > 0 ? (
                              result.postureAnalysis.stability.issues.map((issue) => <li key={issue}>{issue}</li>)
                            ) : (
                              <li>本次动作整体比较稳定，左右侧节奏没有明显失衡。</li>
                            )}
                          </ul>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="font-medium text-slate-100">动作幅度</p>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{result.postureAnalysis.rangeOfMotion.notes}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="font-medium text-slate-100">身体对齐</p>
                          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
                            {result.postureAnalysis.bodyAlignment.issues.length > 0 ? (
                              result.postureAnalysis.bodyAlignment.issues.map((issue) => <li key={issue}>{issue}</li>)
                            ) : (
                              <li>当前主路径与身体中线比较贴合，整体对齐表现不错。</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 p-4">
                      <h3 className="text-lg font-semibold text-emerald-200">当前做得好的地方</h3>
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-emerald-100">
                        {result.strengths.map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-[24px] border border-rose-400/20 bg-rose-500/10 p-4">
                      <h3 className="text-lg font-semibold text-rose-200">潜在风险提醒</h3>
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-100">
                        {result.risks.length > 0 ? (
                          result.risks.map((risk) => <li key={risk}>{risk}</li>)
                        ) : (
                          <li>当前视频里没有看到明显的高风险代偿，但仍建议循序渐进加重。</li>
                        )}
                      </ul>
                    </div>

                    <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-500/10 p-4">
                      <h3 className="text-lg font-semibold text-cyan-100">下一步训练建议</h3>
                      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-cyan-50">
                        {result.suggestions.map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-slate-950/70 px-6 text-center">
                  <div>
                    <p className="text-xl font-medium text-slate-200">上传视频后即可开始分析</p>
                    <p className="mt-3 text-sm leading-7 text-slate-400">完成识别后直接查看轨迹、图表和建议。</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
