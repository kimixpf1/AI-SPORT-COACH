'use client';

import { useState } from 'react';
import { VideoAnalysisResult } from '@/lib/claude';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('请先选择视频文件');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '分析失败');
      }

      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setAnalyzing(false);
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
    <div className="min-h-screen p-8 pb-20 sm:p-20">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          举重教练 - AI视频分析
        </h1>

        {/* 上传区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">上传训练视频</h2>

          <div className="mb-4">
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
              text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            {analyzing ? '分析中...' : '开始分析'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900 text-red-700
              dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* 分析结果 */}
        {result && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">分析结果</h2>

            {/* 基本信息 */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-lg font-medium">动作类型:</span>
                <span className="text-lg text-blue-600 dark:text-blue-400">
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
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">杠铃轨迹分析</h3>
              <div className="space-y-2 text-gray-700 dark:text-gray-300">
                <p><strong>运动路径:</strong> {result.trajectoryAnalysis.barPath}</p>
                {result.trajectoryAnalysis.keyPoints.length > 0 && (
                  <div>
                    <strong>关键位置:</strong>
                    <ul className="list-disc list-inside ml-4">
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
            <div className="mb-6">
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
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">姿态评估</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {result.strengths.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900 p-4 rounded">
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
                <div className="bg-red-50 dark:bg-red-900 p-4 rounded">
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
            <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded">
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
        )}

        {/* 历史记录按钮 */}
        <div className="text-center">
          <button
            onClick={loadHistory}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg"
          >
            查看历史记录
          </button>
        </div>

        {/* 历史记录列表 */}
        {showHistory && (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
      </main>
    </div>
  );
}

