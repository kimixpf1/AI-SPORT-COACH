'use client';

import { useState, useEffect, useRef } from 'react';
import { VideoAnalysisResult } from '@/lib/claude';
import VideoTracker, { VideoTrackerRef } from './components/VideoTracker';
import VelocityChart from './components/VelocityChart';

interface TrackingData {
  trajectory: { x: number; y: number; timestamp: number }[];
  velocityData: { time: number; velocity: number; acceleration: number }[];
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [showTracker, setShowTracker] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<'idle' | 'tracking' | 'analyzing'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const videoTrackerRef = useRef<VideoTrackerRef>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setError(null);
      setResult(null);

      // 创建视频预览 URL
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      const url = URL.createObjectURL(selectedFile);
      setVideoUrl(url);
    }
  };

  // 清理 URL 对象
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const handleAnalyze = async () => {
    if (!file) {
      setError('请先选择视频文件');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setShowTracker(true); // 自动切换到追踪模式

    try {
      // 步骤 1: 轨迹追踪
      setAnalysisStep('tracking');
      console.log('=== 步骤 1: 开始轨迹追踪 ===');

      if (!videoTrackerRef.current) {
        throw new Error('视频追踪组件未就绪');
      }

      await videoTrackerRef.current.startTracking();
      console.log('轨迹追踪完成');

      // 步骤 2: AI 分析
      setAnalysisStep('analyzing');
      console.log('=== 步骤 2: 开始 AI 分析 ===');

      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'AI 分析失败');
      }

      setResult(data.result);
      console.log('AI 分析完成');
    } catch (err) {
      console.error('分析失败:', err);
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setAnalyzing(false);
      setAnalysisStep('idle');
    }
  };

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/history');
      const data = await response.json();
      setHistory(data.analyses || []);
      setShowHistory(true);
    } catch (err) {
      console.error('加载历史记录失败:', err);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* 顶部标题栏 */}
      <header className="bg-white dark:bg-gray-800 shadow-md px-6 py-4 flex-shrink-0">
        <h1 className="text-3xl font-bold text-center">
          举重教练 - AI视频分析
        </h1>
      </header>

      {/* 主内容区域：左右分栏 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：视频上传和预览 */}
        <div className="w-1/2 bg-gray-50 dark:bg-gray-900 p-6 flex flex-col overflow-hidden">
          {/* 上传区域 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-3 flex-shrink-0">
            <h2 className="text-lg font-semibold mb-3">上传训练视频</h2>

            <div className="mb-3">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  dark:file:bg-blue-900 dark:file:text-blue-300"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  已选择: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!file || analyzing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400
                text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              {analyzing
                ? analysisStep === 'tracking'
                  ? '正在追踪杠铃...'
                  : '正在 AI 分析...'
                : '开始分析（追踪+AI）'}
            </button>

            {error && (
              <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-700
                dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          {/* 视频预览/追踪区域 */}
          {videoUrl ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 flex-1 min-h-0 flex flex-col">
              <div className="flex justify-between items-center mb-3 flex-shrink-0">
                <h2 className="text-xl font-semibold">
                  {showTracker ? '杠铃轨迹追踪' : '视频预览'}
                </h2>
                <button
                  onClick={() => setShowTracker(!showTracker)}
                  className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
                >
                  {showTracker ? '返回预览' : '追踪杠铃'}
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {showTracker ? (
                  <VideoTracker
                    ref={videoTrackerRef}
                    videoUrl={videoUrl}
                    onTrackingComplete={(data) => setTrackingData(data)}
                    onTrackingStart={() => console.log('追踪开始')}
                    onTimeUpdate={(time) => setCurrentTime(time)}
                  />
                ) : (
                  <div className="h-full bg-black rounded-lg flex items-center justify-center">
                    <video
                      src={videoUrl}
                      controls
                      className="w-full h-full object-contain"
                      style={{ maxHeight: '100%', maxWidth: '100%' }}
                    >
                      您的浏览器不支持视频播放
                    </video>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={loadHistory}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                查看历史记录
              </button>
            </div>
          )}
        </div>

        {/* 右侧：分析结果（可滚动） */}
        <div className="w-1/2 bg-white dark:bg-gray-800 overflow-y-auto">
          <div className="p-6">
            {/* 速度/加速度图表 - 移到最上方 */}
            {trackingData && trackingData.velocityData.length > 0 && (
              <div className="mb-6">
                <VelocityChart data={trackingData.velocityData} currentTime={currentTime} />
              </div>
            )}

            {/* 分析结果 */}
            {result ? (
              <div>
                <h2 className="text-2xl font-semibold mb-6 sticky top-0 bg-white dark:bg-gray-800 py-2 z-10">
                  AI 分析结果
                </h2>

                {/* 基本信息 */}
                <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-lg font-medium">动作类型:</span>
                    <span className="text-lg text-blue-600 dark:text-blue-400 font-semibold">
                      {result.exerciseType}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">综合评分:</span>
                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {result.overallScore}/10
                    </span>
                  </div>
                </div>

                {/* 轨迹分析 */}
                <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-3">杠铃轨迹分析</h3>
                  <div className="space-y-2 text-gray-700 dark:text-gray-300">
                    <p><strong>运动路径:</strong> {result.trajectoryAnalysis.barPath}</p>
                    {result.trajectoryAnalysis.keyPoints.length > 0 && (
                      <div>
                        <strong>关键位置:</strong>
                        <ul className="list-disc list-inside ml-4 mt-1">
                          {result.trajectoryAnalysis.keyPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p><strong>偏差分析:</strong> {result.trajectoryAnalysis.deviations}</p>
                  </div>
                </div>

                {/* 速度分析 */}
                <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-3">速度与加速度分析</h3>
                  <div className="space-y-3">
                    {result.velocityAnalysis.phases.map((phase, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                        <p className="font-medium">{phase.phase}</p>
                        <p className="text-sm">速度: {phase.velocity}</p>
                        <p className="text-sm">加速度: {phase.acceleration}</p>
                      </div>
                    ))}
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong>关键时刻:</strong> {result.velocityAnalysis.criticalMoments}
                    </p>
                  </div>
                </div>

                {/* 姿态分析 */}
                <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-3">姿态评估</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
                      <p className="font-medium mb-2">稳定性</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {result.postureAnalysis.stability.score}/10
                      </p>
                      {result.postureAnalysis.stability.issues.length > 0 && (
                        <ul className="mt-2 text-sm list-disc list-inside">
                          {result.postureAnalysis.stability.issues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
                      <p className="font-medium mb-2">动作幅度</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {result.postureAnalysis.rangeOfMotion.score}/10
                      </p>
                      <p className="mt-2 text-sm">{result.postureAnalysis.rangeOfMotion.notes}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded">
                      <p className="font-medium mb-2">身体对齐</p>
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {result.postureAnalysis.bodyAlignment.score}/10
                      </p>
                      {result.postureAnalysis.bodyAlignment.issues.length > 0 && (
                        <ul className="mt-2 text-sm list-disc list-inside">
                          {result.postureAnalysis.bodyAlignment.issues.map((issue, i) => (
                            <li key={i}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* 优点和风险 */}
                <div className="grid grid-cols-1 gap-4 mb-6">
                  {result.strengths.length > 0 && (
                    <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
                      <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                        优点
                      </h4>
                      <ul className="list-disc list-inside text-sm text-green-700 dark:text-green-300">
                        {result.strengths.map((strength, i) => (
                          <li key={i}>{strength}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.risks.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900 p-4 rounded-lg">
                      <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                        潜在风险
                      </h4>
                      <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300">
                        {result.risks.map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* 改进建议 */}
                <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
                  <h3 className="text-xl font-semibold mb-3 text-blue-800 dark:text-blue-200">
                    改进建议
                  </h3>
                  <ul className="list-decimal list-inside space-y-2 text-blue-700 dark:text-blue-300">
                    {result.suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <svg className="mx-auto h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg">上传视频并开始分析</p>
                  <p className="text-sm mt-2">分析结果将在这里显示</p>
                </div>
              </div>
            )}

            {/* 历史记录 */}
            {showHistory && (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                <h2 className="text-2xl font-semibold mb-4">历史记录</h2>
                {history.length === 0 ? (
                  <p className="text-gray-500">暂无历史记录</p>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="border dark:border-gray-700 p-4 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{item.exerciseType}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(item.createdAt).toLocaleString('zh-CN')}
                            </p>
                            {item.videoFileName && (
                              <p className="text-sm text-gray-500">{item.videoFileName}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">
                              {item.overallScore}/10
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

