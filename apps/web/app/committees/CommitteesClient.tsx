"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface CommitteeStats {
  committee: string;
  count: number;
  house: string;
}

const COMMITTEE_DESCRIPTIONS: Record<string, string> = {
  "予算委員会":                         "国の予算案・補正予算案を審議する。首相・全閣僚が出席し、国政全般を議論できる最重要委員会。",
  "内閣委員会":                         "内閣官房・内閣府・公務員制度・行政改革などを所管する。",
  "総務委員会":                         "行政組織・地方自治・情報通信・消防・郵政などを所管する。",
  "法務委員会":                         "司法制度・検察・刑事・民事・出入国管理・人権擁護などを所管する。",
  "外務委員会":                         "外交政策・条約・在外公館・政府開発援助（ODA）などを所管する。",
  "外交防衛委員会":                     "参議院で外交政策・防衛・安全保障を一体的に所管する委員会。",
  "財務金融委員会":                     "財政政策・税制・国債・金融・銀行規制などを所管する（衆議院）。",
  "財政金融委員会":                     "財政政策・税制・国債・金融・銀行規制などを所管する（参議院）。",
  "文部科学委員会":                     "教育・科学技術・文化・スポーツ・宗教法人などを所管する（衆議院）。",
  "文教科学委員会":                     "教育・科学技術・文化・スポーツ・宗教法人などを所管する（参議院）。",
  "厚生労働委員会":                     "社会保障・医療・年金・介護・雇用・労働条件などを所管する。",
  "農林水産委員会":                     "農業・林業・水産業・食料安全保障・農地制度などを所管する。",
  "経済産業委員会":                     "産業政策・貿易・中小企業・エネルギー・特許などを所管する。",
  "国土交通委員会":                     "国土開発・道路・河川・港湾・住宅・観光・気象などを所管する。",
  "環境委員会":                         "環境保全・地球温暖化対策・自然保護・公害対策などを所管する。",
  "安全保障委員会":                     "防衛政策・自衛隊・日米安全保障・有事法制などを所管する（衆議院）。",
  "国家基本政策委員会":                 "国家の基本政策を審議する。党首討論（クエスチョンタイム）が行われる場。",
  "決算行政監視委員会":                 "国の決算を審議し、行政の執行状況を監視する（衆議院）。",
  "決算委員会":                         "国の決算を審議し、予算執行の適正を確認する（参議院）。",
  "行政監視委員会":                     "行政の実施状況を監視し、政府機関の問題を調査する（参議院）。",
  "議院運営委員会":                     "本会議の運営・日程・議事手続きなど院の運営全般を取り仕切る。",
  "懲罰委員会":                         "議員の院規違反行為に対する懲罰を審査・議決する。",
  "政治倫理審査会":                     "議員の政治倫理に関する疑義を審査する機関。",
  "憲法審査会":                         "日本国憲法および憲法改正の調査・審査を行う機関。",
  "情報監視審査会":                     "特定秘密保護法に基づき行政機関の秘密指定の適正を監視する。",
  "国民生活・経済に関する調査会":       "国民生活・経済の課題を長期的視点で調査・審査する（参議院）。",
  "国際問題に関する調査会":             "国際情勢・外交問題を長期的視点で調査・審査する（参議院）。",
  "政治改革に関する特別委員会":         "政治制度・選挙制度・政治資金など政治改革に関する事項を審議する特別委員会。",
  "消費者問題に関する特別委員会":       "消費者保護・製品安全・悪質商法など消費者問題を審議する特別委員会。",
  "災害対策及び東日本大震災復興特別委員会": "防災・減災対策および東日本大震災からの復興に関する事項を審議する特別委員会。",
};

export default function CommitteesClient() {
  const router = useRouter();
  const [committees, setCommittees] = useState<CommitteeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [search, setSearch] = useState("");


  useEffect(() => {
    async function fetchCommittees() {
      const { data, error } = await supabase
        .from("committee_members")
        .select("committee, house")
        .limit(2000);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      // 委員会ごとに所属人数を集計
      const countMap: Record<string, number> = {};
      const housesMap: Record<string, Set<string>> = {};
      for (const row of data || []) {
        const name = row.committee?.trim();
        const house = row.house?.trim();
        if (!name) continue;
        countMap[name] = (countMap[name] || 0) + 1;
        if (house) {
          if (!housesMap[name]) housesMap[name] = new Set();
          housesMap[name].add(house);
        }
      }

      const result: CommitteeStats[] = Object.entries(countMap)
        .map(([committee, count]) => ({
          committee,
          count,
          house: [...(housesMap[committee] || [])].sort().join("・") || "その他",
        }))
        .sort((a, b) => b.count - a.count);

      setCommittees(result);
      setLoading(false);
    }
    fetchCommittees();
  }, []);

  const filtered = committees.filter((c) => {
    if (selectedHouse && c.house !== selectedHouse) return false;
    if (search && !c.committee.includes(search)) return false;
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* タイトル・フィルターカード */}
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🏛 委員会一覧</h1>
          <p style={{ color: "#555555", marginBottom: 24, fontSize: 14 }}>
            現在の委員会・調査会ごとの所属議員数
          </p>

          {/* フィルター */}
          <div style={{ display: "flex", gap: 12, marginBottom: 0, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="委員会名で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
              style={{ flex: 1, minWidth: 200 }}
            />
            <select value={selectedHouse} onChange={(e) => setSelectedHouse(e.target.value)}
              className="input-field">
              <option value="">衆院・参院すべて</option>
              <option value="衆議院">衆議院</option>
              <option value="参議院">参議院</option>
            </select>
            {(search || selectedHouse) && (
              <button onClick={() => { setSearch(""); setSelectedHouse(""); }}
                className="btn-clear">
                クリア
              </button>
            )}
          </div>
        </div>

        {/* リストカード */}
        <div className="card-xl">
          <p style={{ color: "#888888", marginBottom: 16, fontSize: 14 }}>
            {filtered.length}件の委員会・調査会
          </p>

          {loading ? (
            <div className="loading-block">
              <div className="loading-spinner" />
              <span>データを読み込んでいます...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              該当する委員会がありません。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((c) => {
                const houseColor = c.house === "衆議院" ? "#333333" : "#888888";

                return (
                  <div key={c.committee}
                    onClick={() => router.push(`/committees/${encodeURIComponent(c.committee)}`)}
                    className="card card-hover"
                    style={{ padding: "16px 20px", "--hover-color": houseColor } as React.CSSProperties}>

                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#111111", marginBottom: 4 }}>
                          {c.committee}
                        </div>
                        <span className="badge badge-party"
                          style={{ "--party-color": houseColor } as React.CSSProperties}>
                          {c.house}
                        </span>
                        {COMMITTEE_DESCRIPTIONS[c.committee] && (
                          <div style={{ fontSize: 12, color: "#666666", marginTop: 6, lineHeight: 1.6 }}>
                            {COMMITTEE_DESCRIPTIONS[c.committee]}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: "#111111" }}>
                          {c.count}
                        </span>
                        <span style={{ fontSize: 12, color: "#555555", marginLeft: 4 }}>名</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
