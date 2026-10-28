"use client";

import Link from "next/link";
import { factionColor } from "../lib/factions";

type Props = {
  id: string;
  name: string;
  alias_name: string | null;
  /** 現在の会派（正式名）。前議員は色を付けない */
  faction?: string | null;
  is_active: boolean;
};

export default function MemberChip({ id, name, alias_name, faction, is_active }: Props) {
  const displayName = alias_name ?? name;
  const color = is_active ? factionColor(faction) : "#888888";
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
      {displayName}
    </Link>
  );
}
