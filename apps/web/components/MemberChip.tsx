"use client";

import Link from "next/link";
import type { Member } from "../lib/types";
import { partyColor } from "../lib/partyColors";

type Props = Pick<Member, "id" | "name" | "alias_name" | "party" | "is_active">;

export default function MemberChip({ id, name, alias_name, party, is_active }: Props) {
  const displayName = alias_name ?? name;
  const color = is_active ? partyColor(party) : "#aaaaaa";
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
