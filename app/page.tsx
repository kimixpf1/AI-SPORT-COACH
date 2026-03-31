'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import VideoTracker from './components/VideoTracker';
import VelocityChart from './components/VelocityChart';
import { ExerciseProfile, HistoryItem, TrackingData, VideoAnalysisResult } from '@/lib/analysis-types';
import { analyzeVideoLocally } from '@/lib/pose-analysis';

const STORAGE_KEY = 'ai-sport-coach-history';

const exerciseOptions: Array<{ value: ExerciseProfile; label: string }> = [
  { value: 'auto', label: '自动识别' },
  { value: 'squat', label: '深蹲' },
  { value: 'bench_press', label: '卧推' },
  { value: 'clean', label: '高翻' },
  { value: 'deadlift', label: '硬拉' },
  { value: 'other', label: '其他力量动作' },
];

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
    if (typeof window === 'undefined') {
      return;
    }

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      setHistory(JSON.parse(saved) as HistoryItem[]);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const latestHistory = useMemo(() => history.slice(0, 6), [history]);

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
    const nextHistory = [nextItem, ...history].slice(0, 12);
    setHistory(nextHistory);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
    }
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

      setResult(nextResult);
      setTrackingData(nextTrackingData);
      setShowHistory(true);

      persistHistory({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        videoFileName: activeFile.name,
        exerciseType: nextResult.exerciseType,
        overallScore: nextResult.overallScore,
        analysisMode: nextResult.analysisMode,
        suggestions: nextResult.suggestions,
      });

      setAnalysisStage('分析完成，可以复盘图表和建议');
      setAnalysisProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败，请更换更清晰的视频重试');
      setAnalysisStage('分析失败，请重新上传或调整拍摄角度');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-2xl shadow-indigo-950/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                MediaPipe 本地分析 · 微信手机端 / 电脑端双适配
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  AI 运动教练
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                  上传深蹲、卧推、高翻、硬拉等训练视频，系统会在浏览器内完成姿态识别、轨迹分析、速度评估和动作建议，更适合训练中快速复盘，也方便直接部署到 Pages。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                '上传自拍视频',
                '本地识别骨架',
                '输出数据图表',
                '生成纠错建议',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">上传与分析</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    现在支持侧面、侧前方、正面等多种机位，清晰度一般或分辨率较低的视频也会优先尝试输出可参考结果。
                  </p>
                </div>
                <button
                  onClick={() => setShowHistory((value) => !value)}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-white/5"
                >
                  {showHistory ? '收起历史' : '查看历史'}
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
                <label className="rounded-2xl border border-dashed border-cyan-400/30 bg-cyan-400/5 p-4">
                  <span className="mb-3 block text-sm font-medium text-cyan-100">训练视频</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mp4,.mov,.avi,.m4v,.webm,.3gp,.hevc"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-medium file:text-slate-950 hover:file:bg-cyan-300"
                  />
                  <p className="mt-3 text-xs leading-5 text-slate-400">支持手机相册常见视频格式。微信、iPhone、安卓导出的视频只要能被浏览器选中，系统都会优先尝试分析。</p>
                  {file && (
                    <p className="mt-3 text-sm text-slate-200">
                      已选择 {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </label>

                <label className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <span className="mb-3 block text-sm font-medium text-slate-100">动作类型</span>
                  <select
                    value={selectedExercise}
                    onChange={(event) => setSelectedExercise(event.target.value as ExerciseProfile)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0"
                  >
                    {exerciseOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    已知动作时优先手动选择，识别会更稳；不确定时再用自动识别。
                  </p>
                </label>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  '微信端建议横屏拍摄，镜头离身体 2-4 米，但只要全身大体入镜也可以先分析',
                  '动作开始前预留 1 秒静止画面，低清或复杂背景下识别会更稳',
                  '侧面、侧前方、正面都可分析；想看路径更准优先侧前方，想看对称性可用正面',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3 sm:space-y-4">
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300 sm:py-3.5"
                >
                  {analyzing ? '正在分析动作视频…' : '开始本地分析'}
                </button>

                <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>{analysisStage}</span>
                    <span>{analysisProgress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                )}
              </div>

              {(file || videoUrl) && (
                <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 sm:hidden">
                  <p className="text-sm font-medium text-cyan-100">手机端快捷操作</p>
                  <p className="mt-2 text-xs leading-5 text-cyan-50/90">
                    如果微信里选完视频后按钮仍未变化，直接点上面的“开始本地分析”，系统会再从文件框里读取一次视频。
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">视频预览与轨迹叠加</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    绿色轨迹用于回看动作主路径，结合下方的关键指标与时间线可以更快定位发力问题。
                  </p>
                </div>
                {trackingData && (
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                    有效姿态帧 {trackingData.detectedFrames}/{trackingData.sampleCount}
                  </div>
                )}
              </div>

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
                <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/70 text-center text-sm text-slate-500">
                  上传训练视频后，这里会显示原视频与动作轨迹。
                </div>
              )}
            </div>

            {showHistory && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
                <h2 className="text-xl font-semibold">最近分析记录</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Pages 版本使用浏览器本地存储保存最近记录，方便手机和电脑快速回看。
                </p>

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
                        {item.suggestions[0] && (
                          <p className="mt-3 text-sm text-slate-300">下次优先改进：{item.suggestions[0]}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-6">
            {trackingData && trackingData.velocityData.length > 0 && (
              <VelocityChart data={trackingData.velocityData} currentTime={currentTime} />
            )}

            {trackingData && (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">关键姿态指标</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      当前版本会根据机位和可见性自动切换到更稳的跟踪锚点，尽量在多角度、不同清晰度下继续给出可参考的复盘结论。
                    </p>
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
                    <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
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
                    <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                      <p className="text-sm text-slate-400">{label}</p>
                      <p className="mt-2 text-base font-semibold text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">前后漂移</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-100">
                      {trackingData.metricSummary.horizontalDrift.toFixed(0)} px
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      数值越小，说明动作主路径越集中；如果中段突然放大，通常需要回看起始站位、核心张力和加速方向。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">动作时间线</p>
                    <div className="mt-3 space-y-3">
                      {trackingData.highlights.map((item) => (
                        <div key={`${item.title}-${item.timestamp}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-100">{item.title}</p>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-300">
                              {item.timestamp.toFixed(2)} 秒
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {trackingData.captureAssessment.warnings.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                    <h3 className="text-lg font-semibold text-amber-100">识别条件提醒</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-50">
                      {trackingData.captureAssessment.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
              {result ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-slate-400">动作类型</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-50">{result.exerciseType}</p>
                        <p className="mt-2 text-sm text-cyan-300">{result.analysisMode}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-500/10 px-5 py-4 text-center">
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
                      <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                        <p className="text-sm text-slate-400">{label}</p>
                        <p className="mt-2 text-3xl font-semibold text-cyan-300">{score}/10</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <h3 className="text-lg font-semibold">拍摄与识别评估</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ['机位判断', result.captureAssessment.angleLabel],
                        ['识别可信度', result.captureAssessment.confidenceLabel],
                        ['关键点可见性', `${result.captureAssessment.visibilityScore}%`],
                        ['主体覆盖度', `${result.captureAssessment.coverageScore}%`],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="text-sm text-slate-400">{label}</p>
                          <p className="mt-2 text-base font-semibold text-slate-100">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <h3 className="text-lg font-semibold">轨迹分析</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{result.trajectoryAnalysis.barPath}</p>
                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      {result.trajectoryAnalysis.keyPoints.map((point) => (
                        <div key={point} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          {point}
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">{result.trajectoryAnalysis.deviations}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <h3 className="text-lg font-semibold">速度与节奏</h3>
                    <div className="mt-4 space-y-3">
                      {result.velocityAnalysis.phases.map((phase) => (
                        <div key={phase.phase} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <p className="font-medium text-slate-100">{phase.phase}</p>
                          <p className="mt-2 text-sm text-slate-300">速度：{phase.velocity}</p>
                          <p className="mt-1 text-sm text-slate-400">加速度：{phase.acceleration}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-300">{result.velocityAnalysis.criticalMoments}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
                    <h3 className="text-lg font-semibold">姿态重点</h3>
                    <div className="mt-4 grid gap-4">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-medium text-slate-100">稳定性观察</p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                          {result.postureAnalysis.stability.issues.length > 0 ? (
                            result.postureAnalysis.stability.issues.map((issue) => <li key={issue}>{issue}</li>)
                          ) : (
                            <li>本次动作整体比较稳定，左右侧节奏没有明显失衡。</li>
                          )}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-medium text-slate-100">动作幅度</p>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{result.postureAnalysis.rangeOfMotion.notes}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-medium text-slate-100">身体对齐</p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                          {result.postureAnalysis.bodyAlignment.issues.length > 0 ? (
                            result.postureAnalysis.bodyAlignment.issues.map((issue) => <li key={issue}>{issue}</li>)
                          ) : (
                            <li>当前主路径与身体中线比较贴合，整体对齐表现不错。</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                      <h3 className="text-lg font-semibold text-emerald-200">当前做得好的地方</h3>
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-100">
                        {result.strengths.map((strength) => (
                          <li key={strength}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                      <h3 className="text-lg font-semibold text-rose-200">潜在风险提醒</h3>
                      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-100">
                        {result.risks.length > 0 ? (
                          result.risks.map((risk) => <li key={risk}>{risk}</li>)
                        ) : (
                          <li>当前视频里没有看到明显的高风险代偿，但仍建议循序渐进加重。</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                    <h3 className="text-lg font-semibold text-cyan-100">下一步训练建议</h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-cyan-50">
                      {result.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/70 px-6 text-center">
                  <div>
                    <p className="text-xl font-medium text-slate-200">上传视频后即可开始分析</p>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      当前版本优先强化手机端微信浏览器与桌面端通用体验，后续还可以继续补充多角度对比、训练周期追踪和更多专项动作。
                    </p>
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

