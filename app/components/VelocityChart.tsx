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
  const chartData = data.map((point) => ({
    time: point.time.toFixed(2),
    velocity: parseFloat(point.velocity.toFixed(2)),
    acceleration: parseFloat(point.acceleration.toFixed(2)),
  }));

  return (
    <div className="w-full rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl shadow-black/20">
      <h3 className="mb-4 text-xl font-semibold text-slate-100">速度与加速度分析</h3>
      <div style={{ width: '100%', height: '220px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="time"
              label={{ value: '时间 (秒)', position: 'insideBottom', offset: -10 }}
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              stroke="#64748b"
            />
            <YAxis
              yAxisId="left"
              label={{ value: '速度', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              stroke="#8b5cf6"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              label={{ value: '加速度', angle: 90, position: 'insideRight' }}
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              stroke="#22c55e"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '12px',
                color: '#f8fafc',
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '10px', color: '#e2e8f0' }} iconType="line" />
            {currentTime > 0 && (
              <ReferenceLine
                x={currentTime.toFixed(2)}
                stroke="#f97316"
                strokeWidth={2}
                label={{ value: '当前', position: 'top', fill: '#f97316', fontSize: 12 }}
                strokeDasharray="3 3"
                yAxisId="left"
              />
            )}
            <Line yAxisId="left" type="monotone" dataKey="velocity" stroke="#8b5cf6" strokeWidth={2} name="速度" dot={false} activeDot={{ r: 6 }} />
            <Line yAxisId="right" type="monotone" dataKey="acceleration" stroke="#22c55e" strokeWidth={2} name="加速度" dot={false} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
