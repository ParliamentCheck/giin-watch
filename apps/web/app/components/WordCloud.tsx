"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import cloud from "d3-cloud";

interface WordData {
  word: string;
  count: number;
}

interface Props {
  keywords: WordData[];
  width?: number;
  height?: number;
}

const COLORS = [
  "#3b82f6", "#60a5fa", "#93c5fd",
  "#34d399", "#6ee7b7",
  "#f59e0b", "#fcd34d",
  "#f87171", "#fca5a5",
  "#a78bfa", "#c4b5fd",
];

export default function WordCloud({ keywords, width = 500, height = 300 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || keywords.length === 0) return;

    const maxCount = Math.max(...keywords.map((k) => k.count));
    const minCount = Math.min(...keywords.map((k) => k.count));
    const sizeScale = d3.scaleLinear()
      .domain([minCount, maxCount])
      .range([12, 48]);

    d3.select(svgRef.current).selectAll("*").remove();

    cloud()
      .size([width, height])
      .words(keywords.map((k) => ({
        text: k.word,
        size: sizeScale(k.count),
        count: k.count,
      })))
      .padding(4)
      .rotate(() => (Math.random() > 0.8 ? 90 : 0))
      .font("'Hiragino Kaku Gothic ProN', sans-serif")
      .fontSize((d) => d.size || 12)
      .on("end", (words) => {
        d3.select(svgRef.current)
          .attr("width", width)
          .attr("height", height)
          .append("g")
          .attr("transform", `translate(${width / 2},${height / 2})`)
          .selectAll("text")
          .data(words)
          .enter()
          .append("text")
          .style("font-size", (d) => `${d.size}px`)
          .style("font-family", "'Hiragino Kaku Gothic ProN', sans-serif")
          .style("fill", () => COLORS[Math.floor(Math.random() * COLORS.length)])
          .style("cursor", "default")
          .attr("text-anchor", "middle")
          .attr("transform", (d) => `translate(${[d.x, d.y]})rotate(${d.rotate})`)
          .append("title")
          .text((d: any) => `${d.text}: ${d.count}回`);
      })
      .start();
  }, [keywords, width, height]);

  if (keywords.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#475569", padding: "40px 0", fontSize: 13 }}>
        発言データが少ないため、キーワードを抽出できませんでした。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
      <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto" }} />
    </div>
  );
}
