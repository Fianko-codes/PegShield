import { Radio } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { cn } from '../types';

type MarketChartPoint = {
  time: string;
  spread: number;
};

export default function AppMarketChart({
  chartData,
  accentColor,
  heartbeat,
  regimeFlag,
  baselineSpread,
}: {
  chartData: MarketChartPoint[];
  accentColor: string;
  heartbeat: boolean;
  regimeFlag: number;
  baselineSpread: number;
}) {
  return (
    <div className="relative border border-zinc-800 bg-black p-4 sm:p-6">
      <div className="absolute left-4 right-4 top-4 z-10 sm:left-6 sm:right-auto">
        <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          Live Market Premium
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
          <Radio
            size={10}
            className={cn(
              'transition-colors duration-300',
              heartbeat
                ? regimeFlag === 1
                  ? 'text-emergency-red'
                  : 'text-solana-green'
                : 'text-zinc-700',
            )}
          />
          Hermes pulse + live append
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-zinc-700">
          Snapshot base + live tail overlay
        </div>
      </div>
      <div className="mt-16 h-[260px] w-full sm:mt-8 sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#444"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              stroke="#444"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 0.001', 'dataMax + 0.001']}
              tickFormatter={(value: number) => `${(value * 100).toFixed(2)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0D0D0D',
                border: '1px solid #333',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
              itemStyle={{ color: accentColor }}
              formatter={(value) => `${(Number(value ?? 0) * 100).toFixed(2)}%`}
            />
            <ReferenceLine y={baselineSpread} stroke="#333" strokeDasharray="5 5" />
            <Area
              type="monotone"
              dataKey="spread"
              stroke={accentColor}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSpread)"
              animationDuration={1000}
              activeDot={{
                r: 6,
                stroke: accentColor,
                strokeWidth: 2,
                fill: '#0D0D0D',
              }}
              dot={(props) => {
                const pointIndex = typeof props.index === 'number' ? props.index : -1;
                if (pointIndex !== chartData.length - 1) {
                  return false;
                }

                return (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={heartbeat ? 5 : 3}
                    stroke={accentColor}
                    strokeWidth={2}
                    fill="#0D0D0D"
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
