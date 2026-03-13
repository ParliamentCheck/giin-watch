"use client";

interface Props {
  sessionCount:  number;
  questionCount: number;
  billCount:     number;
  petitionCount: number;
  maxValues: {
    session:  number;
    question: number;
    bill:     number;
    petition: number;
  };
  color?: string;
}

const SIZE   = 200;
const CENTER = SIZE / 2;
const RADIUS = 72;
const LABEL_OFFSET = 22;

const AXES = [
  { key: "session",  label: "発言" },
  { key: "question", label: "質問主意書" },
  { key: "bill",     label: "議員立法" },
  { key: "petition", label: "請願" },
] as const;

function polarToXY(angle: number, r: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  };
}

export default function ActivityRadar({
  sessionCount, questionCount, billCount, petitionCount,
  maxValues, color = "#333333",
}: Props) {
  const rawValues = {
    session:  sessionCount,
    question: questionCount,
    bill:     billCount,
    petition: petitionCount,
  };

  const ratios = AXES.map(({ key }) => {
    const max = maxValues[key];
    return max > 0 ? Math.min(rawValues[key] / max, 1) : 0;
  });

  const n = AXES.length;
  const angleStep = 360 / n;

  // 背景グリッド（25%, 50%, 75%, 100%）
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const gridPolygons = gridLevels.map((level) => {
    const points = AXES.map((_, i) => {
      const { x, y } = polarToXY(i * angleStep, RADIUS * level);
      return `${x},${y}`;
    }).join(" ");
    return points;
  });

  // データポリゴン
  const dataPoints = ratios.map((ratio, i) => {
    const { x, y } = polarToXY(i * angleStep, RADIUS * ratio);
    return `${x},${y}`;
  }).join(" ");

  // 軸の端点とラベル位置
  const axisEndpoints = AXES.map((axis, i) => {
    const angle = i * angleStep;
    const tip   = polarToXY(angle, RADIUS);
    const label = polarToXY(angle, RADIUS + LABEL_OFFSET);
    return { ...axis, tip, label, value: rawValues[axis.key] };
  });

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      style={{ overflow: "visible" }}
    >
      {/* グリッドポリゴン */}
      {gridPolygons.map((points, i) => (
        <polygon
          key={i}
          points={points}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={1}
        />
      ))}

      {/* 軸線 */}
      {axisEndpoints.map(({ tip }, i) => (
        <line
          key={i}
          x1={CENTER} y1={CENTER}
          x2={tip.x}  y2={tip.y}
          stroke="#e0e0e0"
          strokeWidth={1}
        />
      ))}

      {/* データポリゴン */}
      <polygon
        points={dataPoints}
        fill={color}
        fillOpacity={0.15}
        stroke={color}
        strokeWidth={1.5}
      />

      {/* データ頂点 */}
      {ratios.map((ratio, i) => {
        const { x, y } = polarToXY(i * angleStep, RADIUS * ratio);
        return (
          <circle key={i} cx={x} cy={y} r={3} fill={color} />
        );
      })}

      {/* 軸ラベルと数値 */}
      {axisEndpoints.map(({ label, label: lbl, value, key }, i) => {
        const angle = i * angleStep;
        const isLeft   = angle > 180 && angle < 360;
        const isBottom = angle > 90  && angle < 270;
        const anchor = isLeft ? "end" : angle === 180 ? "end" : angle === 0 ? "middle" : "start";
        const dy = isBottom ? 14 : -4;

        return (
          <g key={key}>
            <text
              x={lbl.x} y={lbl.y}
              textAnchor={angle === 0 || angle === 180 ? "middle" : isLeft ? "end" : "start"}
              dominantBaseline="middle"
              fontSize={10}
              fill="#888888"
            >
              {AXES[i].label}
            </text>
            <text
              x={lbl.x} y={lbl.y + 12}
              textAnchor={angle === 0 || angle === 180 ? "middle" : isLeft ? "end" : "start"}
              dominantBaseline="middle"
              fontSize={10}
              fontWeight={700}
              fill="#333333"
            >
              {value.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
