"use client";

import Link from "next/link";
import { partyColor } from "../lib/partyColors";

interface Props {
  id: string;
  name: string;
  party: string;
  isFormer?: boolean;
}

export default function MemberChip({ id, name, party, isFormer = false }: Props) {
  const color = isFormer ? "#aaaaaa" : partyColor(party);
  return (
    <Link
      href={`/members/${encodeURIComponent(id)}`}
      style={{
        fontSize: 12,
        color,
        background: "#f9f9f9",
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "2px 8px",
        textDecoration: "none",
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </Link>
  );
}
