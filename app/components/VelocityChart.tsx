'use client';

import { useMemo } from 'react';
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
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        time: Number(point.time.toFixed(2)),
        velocity: Number(point.velocity.toFixed(2)),
        acceleration: Number(point.acceleration.toFixed(2)),
      })),
    [data]
  );

  const summary = useMemo(() => {
    if (chartData.length === 0) {
      return null;
    }

    const peakVelocity = chartData.reduce((best, point) => Math.max(best, point.velocity), 0);
    const peakAcceleration = chartData.reduce((best, point) => Math.max(best, Math.abs(point.acceleration)), 0);
    const averageVelocity =
      chartData.reduce((sum, point) => sum + point.velocity, 0) / chartData.length;

    return {
      peakVelocity,
      peakAcceleration,
      averageVelocity,
    };
  }, [chartData]);

  return (
    <div className="rounded-[30px] border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Tempo Graph</p>
          <h3 className="text-xl font-semibold text-slate-50">速度与加速度分析</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            结合当前时间线观察发力峰值、节奏切换和减速控制，便于复盘动作的输出窗口。
          </p>
        </div>
        {summary && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-slate-950/70 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">平均速度</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{summary.averageVelocity.toFixed(0)} px/s</p>
            </div>
            <div className="rounded-[22px] border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">峰值速度</p>
              <p className="mt-1 text-sm font-medium text-cyan-100">{summary.peakVelocity.toFixed(0)} px/s</p>
            </div>
            <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">峰值加速度</p>
              <p className="mt-1 text-sm font-medium text-emerald-100">{summary.peakAcceleration.toFixed(0)} px/s²</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-5 h-[240px] w-full sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 14, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              label={{ value: '时间', position: 'insideBottom', offset: -10 }}
              stroke="#94a3b8"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="left"
              stroke="#22d3ee"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#34d399"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${Number(value).toFixed(2)} ${name === '速度' ? 'px/s' : 'px/s²'}`,
                name,
              ]}
              labelFormatter={(value) => `${value} 秒`}
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.96)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                color: '#e2e8f0',
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '10px', color: '#cbd5e1' }}
              iconType="line"
            />

            {currentTime > 0 && (
              <ReferenceLine
                x={Number(currentTime.toFixed(2))}
                stroke="#f97316"
                strokeWidth={2}
                label={{ value: '当前', position: 'top', fill: '#f97316', fontSize: 12 }}
                strokeDasharray="3 3"
                yAxisId="left"
              />
            )}

            <Line
              yAxisId="left"
              type="monotone"
              dataKey="velocity"
              stroke="#22d3ee"
              strokeWidth={2}
              name="速度"
              dot={false}
              activeDot={{ r: 6 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="acceleration"
              stroke="#34d399"
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
