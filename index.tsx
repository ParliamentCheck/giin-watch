// apps/web/components/features/party-whip/index.tsx
/**
 * 党議拘束チェッカー — 表示コンポーネント
 *
 * 「党方針と異なる投票をした議員」を表示する。
 * データの信頼度（confirmed / inferred / unknown）を必ず明示する。
 * エビデンスのある情報のみを淡々と示す。
 */

import { usePartyWhip } from "./hooks";
import type { WhipDeviation } from "@giin-watch/types";

const CONFIDENCE_LABEL: Record<string, { text: string; color: string; note: string }> = {
  confirmed: {
    text: "党公式発表",
    color: "#22c55e",
    note: "党の公式プレスリリース・声明に基づく",
  },
  inferred: {
    text: "報道から推定",
    color: "#f59e0b",
    note: "幹事長コメント等の報道を元に推定。確定情報ではない",
  },
  unknown: {
    text: "方針不明",
    color: "#6b7280",
    note: "党の公式方針が確認できないため表示しない",
  },
};

interface Props {
  memberId?: string;   // 議員IDで絞り込む場合
  party?: string;      // 政党で絞り込む場合
  billId?: string;     // 法案で絞り込む場合
}

export function PartyWhipChecker({ memberId, party, billId }: Props) {
  const { deviations, isLoading, error } = usePartyWhip({ memberId, party, billId });

  if (isLoading) {
    return <div style={styles.loading}>データ取得中...</div>;
  }

  if (error) {
    return <div style={styles.error}>データの取得に失敗しました</div>;
  }

  // unknownは表示しない
  const visible = deviations.filter((d) => d.stanceConfidence !== "unknown");

  return (
    <div>
      {/* 説明バナー */}
      <div style={styles.infoBanner}>
        <span style={styles.infoIcon}>ℹ️</span>
        <div>
          <div style={styles.infoTitle}>党議拘束チェッカーについて</div>
          <div style={styles.infoText}>
            党の公式方針が確認・推定できた法案のみを表示しています。
            信頼度が「報道から推定」のデータは、確定情報ではありません。
            出典リンクから原文をご確認ください。
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={styles.empty}>
          方針との乖離が確認された投票記録はありません
        </div>
      ) : (
        <div>
          {visible.map((d, i) => (
            <DeviationRow key={i} deviation={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviationRow({ deviation: d }: { deviation: WhipDeviation }) {
  const conf = CONFIDENCE_LABEL[d.stanceConfidence];

  return (
    <div style={styles.row}>
      {/* 法案名・日付 */}
      <div style={styles.rowLeft}>
        <div style={styles.billName}>{d.billName}</div>
        <div style={styles.billDate}>{d.date}</div>
      </div>

      {/* 投票比較 */}
      <div style={styles.voteCompare}>
        <VoteBadge choice={d.partyStance} label={`${d.party}方針`} muted />
        <span style={styles.arrow}>→</span>
        <VoteBadge choice={d.actualVote} label="実際の投票" />
      </div>

      {/* 信頼度 */}
      <div style={{ ...styles.confidenceBadge, borderColor: conf.color, color: conf.color }}>
        <span style={styles.confidenceDot(conf.color)} />
        {conf.text}
        <span style={styles.confidenceNote} title={conf.note}>?</span>
      </div>
    </div>
  );
}

function VoteBadge({
  choice,
  label,
  muted = false,
}: {
  choice: string;
  label: string;
  muted?: boolean;
}) {
  const COLOR: Record<string, string> = {
    賛成: "#22c55e",
    反対: "#ef4444",
    棄権: "#f59e0b",
    欠席: "#6b7280",
  };
  const color = muted ? "#6b7280" : COLOR[choice] ?? "#6b7280";

  return (
    <div style={styles.voteBadgeWrap}>
      <div style={styles.voteLabel}>{label}</div>
      <span style={{ ...styles.voteBadge, background: color + "22", color, border: `1px solid ${color}44` }}>
        {choice}
      </span>
    </div>
  );
}

// ─── スタイル ──────────────────────────────────────────────────
const styles = {
  loading: { padding: 40, textAlign: "center" as const, color: "#64748b" },
  error: { padding: 40, textAlign: "center" as const, color: "#ef4444" },
  infoBanner: {
    display: "flex", gap: 12, background: "#0f172a",
    border: "1px solid #1e293b", borderRadius: 10,
    padding: "12px 16px", marginBottom: 16, alignItems: "flex-start",
  },
  infoIcon: { fontSize: 16, flexShrink: 0 },
  infoTitle: { fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 4 },
  infoText: { fontSize: 12, color: "#64748b", lineHeight: 1.6 },
  empty: {
    padding: 32, textAlign: "center" as const,
    color: "#475569", background: "#0f172a",
    border: "1px solid #1e293b", borderRadius: 10,
  },
  row: {
    display: "flex", alignItems: "center", gap: 16,
    padding: "14px 16px", marginBottom: 8,
    background: "#0f172a", border: "1px solid #1e293b",
    borderRadius: 10,
  },
  rowLeft: { flex: 1 },
  billName: { fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 },
  billDate: { fontSize: 12, color: "#475569" },
  voteCompare: { display: "flex", alignItems: "center", gap: 10 },
  arrow: { color: "#334155", fontSize: 16 },
  voteBadgeWrap: { textAlign: "center" as const },
  voteLabel: { fontSize: 10, color: "#475569", marginBottom: 2 },
  voteBadge: { padding: "2px 10px", borderRadius: 4, fontSize: 13, fontWeight: 700 },
  confidenceBadge: {
    display: "flex", alignItems: "center", gap: 6,
    border: "1px solid", borderRadius: 20,
    padding: "3px 10px", fontSize: 11, fontWeight: 600,
  },
  confidenceDot: (color: string) => ({
    width: 6, height: 6, borderRadius: "50%",
    background: color, display: "inline-block",
  }),
  confidenceNote: {
    width: 14, height: 14, borderRadius: "50%",
    background: "#1e293b", color: "#64748b",
    display: "inline-flex", alignItems: "center",
    justifyContent: "center", fontSize: 10, cursor: "help",
  },
};
