"use client";

export interface RadarAxisDef {
  key:      string;
  label:    string;
  value:    number;
  globalMax: number;
}

interface Props {
  axes:   RadarAxisDef[];
  color?: string;
}

const SIZE         = 200;
const CENTER       = SIZE / 2;
const RADIUS       = 72;
const LABEL_OFFSET = 22;

function polarToXY(angle: number, r: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  };
}

export default function ActivityRadar({ axes, color = "#333333" }: Props) {
  // ① 全体MAXで正規化
  const ratios = axes.map(({ value, globalMax }) =>
    globalMax > 0 ? value / globalMax : 0
  );

  // ② 最小比率で割って活動バランスを算出（最小が0の場合はそのまま）
  const minRatio   = Math.min(...ratios);
  const balanced   = ratios.map(r => minRatio > 0 ? r / minRatio : r);

  // ③ レーダー表示用に最大値を1.0に正規化
  const balancedMax  = Math.max(...balanced);
  const chartRatios  = balanced.map(r => balancedMax > 0 ? r / balancedMax : 0);

  const n         = axes.length;
  const angleStep = 360 / n;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const gridPolygons = gridLevels.map((level) => {
    const points = axes.map((_, i) => {
      const { x, y } = polarToXY(i * angleStep, RADIUS * level);
      return `${x},${y}`;
    }).join(" ");
    return points;
  });

  const dataPoints = chartRatios.map((ratio, i) => {
    const { x, y } = polarToXY(i * angleStep, RADIUS * ratio);
    return `${x},${y}`;
  }).join(" ");

  const axisEndpoints = axes.map((axis, i) => {
    const angle = i * angleStep;
    const tip   = polarToXY(angle, RADIUS);
    const label = polarToXY(angle, RADIUS + LABEL_OFFSET);
    return { ...axis, tip, label, angle };
  });

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      style={{ overflow: "visible", display: "block", margin: "auto" }}
    >
      {/* グリッドポリゴン */}
      {gridPolygons.map((points, i) => (
        <polygon key={i} points={points} fill="none" stroke="#e0e0e0" strokeWidth={1} />
      ))}

      {/* 軸線 */}
      {axisEndpoints.map(({ tip }, i) => (
        <line key={i} x1={CENTER} y1={CENTER} x2={tip.x} y2={tip.y} stroke="#e0e0e0" strokeWidth={1} />
      ))}

      {/* データポリゴン */}
      <polygon points={dataPoints} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />

      {/* データ頂点 */}
      {chartRatios.map((ratio, i) => {
        const { x, y } = polarToXY(i * angleStep, RADIUS * ratio);
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}

      {/* 軸ラベル */}
      {axisEndpoints.map(({ label, key, angle }, i) => {
        const isLeft = angle > 180 && angle < 360;
        const anchor = angle === 0 || angle === 180 ? "middle" : isLeft ? "end" : "start";
        return (
          <text
            key={key}
            x={label.x} y={label.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={10}
            fill="#888888"
          >
            {axes[i].label}
          </text>
        );
      })}
    </svg>
  );
}
