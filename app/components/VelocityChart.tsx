'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface VelocityChartProps {
  data: { time: number; velocity: number; acceleration: number }[];
  currentTime?: number;
}

export default function VelocityChart({ data, currentTime = 0 }: VelocityChartProps) {
  // 格式化数据
  const chartData = data.map((point) => ({
    time: point.time.toFixed(2), // 保持字符串格式
    velocity: parseFloat(point.velocity.toFixed(2)),
    acceleration: parseFloat(point.acceleration.toFixed(2)),
  }));

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold mb-4">速度与加速度分析</h3>
      <div style={{ width: '100%', height: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="time"
              label={{ value: '时间 (秒)', position: 'insideBottom', offset: -10 }}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              yAxisId="left"
              label={{ value: '速度 (像素/秒)', angle: -90, position: 'insideLeft' }}
              stroke="#8884d8"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ value: '加速度 (像素/秒²)', angle: 90, position: 'insideRight' }}
              stroke="#82ca9d"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="line"
            />

            {/* 当前时间指示线 */}
            {currentTime > 0 && (
              <ReferenceLine
                x={currentTime.toFixed(2)} // 字符串格式，匹配 chartData 的 time
                stroke="red"
                strokeWidth={2}
                label={{ value: '当前', position: 'top', fill: 'red', fontSize: 12 }}
                strokeDasharray="3 3"
                yAxisId="left" // 指定 yAxis，避免默认使用不存在的 id "0"
              />
            )}

            <Line
              yAxisId="left"
              type="monotone"
              dataKey="velocity"
              stroke="#8884d8"
              strokeWidth={2}
              name="速度"
              dot={false}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="acceleration"
              stroke="#82ca9d"
              strokeWidth={2}
              name="加速度"
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
