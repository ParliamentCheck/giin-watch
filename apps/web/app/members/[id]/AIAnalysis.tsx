"use client";

import AIAnalysisBase from "../../components/AIAnalysisBase";

const DEFAULT_QUESTION =
  "提供された活動データ（質問主意書・議員立法・採決・委員会・請願）の内容と件数から読み取れることを教えてください。";

const SYSTEM_PROMPT =
  "あなたは日本の国会議員の活動データを分析するアシスタントです。" +
  "提供するデータは国会の公式記録から取得した客観的な情報です。" +
  "以下の点に注意して分析してください：" +
  "採決データは党議拘束の影響を受けるため、個人の意思を完全には反映しません。" +
  "質問主意書・議員立法は個人の意思が反映されやすい傾向があります。" +
  "内閣総理大臣・大臣などの閣僚は行政府の立場にあるため、在任中は質問主意書や議員立法をほぼ提出しません。件数が少ない場合はその職務の性質によるものです。" +
  "断定的な評価ではなく、データから読み取れる傾向として述べてください。";

interface AIAnalysisProps {
  member: { name: string; party: string; house: string; district?: string | null; cabinet_post?: string | null; session_count?: number | null; terms?: number | null } | null;
  questions: { title: string; submitted_at: string }[];
  votes: { bill_title: string; vote: string; vote_date: string | null }[];
  bills: { title: string; submitted_at: string | null }[];
  petitions: { title: string }[];
  committees: { committee: string; role: string }[];
}

function buildContext(props: AIAnalysisProps): string {
  const { member, questions, votes, bills, petitions, committees } = props;
  if (!member) return "";

  const year = (date: string | null | undefined) =>
    date ? date.slice(0, 4) : "年不明";

  const allDates: string[] = [
    ...questions.map((q) => q.submitted_at).filter(Boolean),
    ...bills.map((b) => b.submitted_at).filter(Boolean),
    ...votes.map((v) => v.vote_date).filter(Boolean),
  ] as string[];
  const dataFrom = allDates.length > 0
    ? allDates.reduce((a, b) => (a < b ? a : b)).slice(0, 7)
    : null;
  const dataTo = allDates.length > 0
    ? allDates.reduce((a, b) => (a > b ? a : b)).slice(0, 7)
    : null;

  const lines: string[] = [];
  const districtPart = member.district ? `・${member.district}` : "";
  lines.push(`議員名: ${member.name}（${member.party}・${member.house}${districtPart}）`);
  if (member.cabinet_post) {
    lines.push(`現職: ${member.cabinet_post}`);
  }
  if (member.terms != null) {
    lines.push(`当選回数: ${member.terms}回`);
  }
  if (member.session_count != null) {
    lines.push(`国会発言セッション数: ${member.session_count}回`);
  }
  {
    const parts = ["発言: 第210回国会（2022年）以降"];
    if (dataFrom && dataTo) {
      parts.push(`質問主意書・議員立法・採決・請願: ${dataFrom}〜${dataTo}`);
    }
    lines.push(`※ データ収集範囲 — ${parts.join("、")}`);
  }
  lines.push("");

  lines.push(`■ 質問主意書（${questions.length}件）`);
  if (questions.length > 0) {
    for (const q of questions) lines.push(`- ${q.title}（${year(q.submitted_at)}）`);
  }
  lines.push("");

  lines.push(`■ 提出した議員立法（${bills.length}件）`);
  if (bills.length > 0) {
    for (const b of bills) lines.push(`- ${b.title}（${year(b.submitted_at)}）`);
  }
  lines.push("");

  const yea = votes.filter((v) => v.vote === "賛成");
  const nay = votes.filter((v) => v.vote === "反対");
  if (votes.length > 0) {
    lines.push(`■ 採決（直近${votes.length}件）`);
    lines.push("※ 党議拘束により党全体の方針と重なる場合があります");
    for (const v of yea) lines.push(`賛成: ${v.bill_title}（${year(v.vote_date)}）`);
    for (const v of nay) lines.push(`反対: ${v.bill_title}（${year(v.vote_date)}）`);
    lines.push("");
  }

  if (committees.length > 0) {
    lines.push("■ 所属委員会");
    for (const c of committees) lines.push(`- ${c.committee}（${c.role}）`);
    lines.push("");
  }

  if (petitions.length > 0) {
    lines.push(`■ 紹介した請願（${petitions.length}件）`);
    for (const p of petitions) lines.push(`- ${p.title}`);
  }

  return lines.join("\n");
}

export default function AIAnalysis(props: AIAnalysisProps) {
  if (!props.member) return null;

  const contextText = buildContext(props);
  const memberName = props.member.name;

  return (
    <AIAnalysisBase
      contextText={contextText}
      systemPrompt={SYSTEM_PROMPT}
      defaultQuestion={DEFAULT_QUESTION}
      downloadFilename={memberName}
      tipContent={
        <>
          💡 <strong>分析精度について：</strong>
          質問主意書・議員立法・採決記録が多い議員ほど詳細な分析が可能です。
          閣僚在任中など行政府の立場にある議員は、これらの活動が少ない傾向があるため、分析の根拠となるデータが限られます。
          また、発言データはサービスの収集範囲内のみが対象です。
        </>
      }
    />
  );
}
