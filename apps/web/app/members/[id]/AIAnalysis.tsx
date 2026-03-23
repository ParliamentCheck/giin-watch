"use client";

import AIAnalysisBase from "../../components/AIAnalysisBase";

const DEFAULT_QUESTION =
  "提供された活動データ（質問主意書・議員立法・採決・委員会・請願・発言キーワード・共同提出パートナーなど）から、この議員の独自の特徴・活動スタイルを教えてください。特に「この議員だけが目立つシグネチャー」（繰り返し提出、特定課題での成果、党派を超えた連携など）と、直近の注目活動を重視してください。";

const SYSTEM_PROMPT =
  "あなたは日本の国会議員の活動データを分析するアシスタントです。" +
  "提供するデータは国会の公式記録から取得した客観的な情報です。" +
  "以下の点に注意して分析してください：" +
  "採決データは党議拘束の影響を受けるため、個人の意思を完全には反映しません。党議拘束の影響が強い中で個人の傾向との乖離が見られる場合は指摘してください。" +
  "質問主意書・議員立法は個人の意思が反映されやすい傾向があります。" +
  "内閣総理大臣・大臣などの閣僚は行政府の立場にあるため、在任中は質問主意書や議員立法をほぼ提出しません。件数が少ない場合はその職務の性質によるものです。" +
  "共同提出パートナーから、党派を超えた連携の特徴を読み取ってください。" +
  "発言抜粋が提供されている場合は、発言内容の「報告」ではなく、この議員のシグネチャーや政策スタイルを抽出する「分析材料」として活用してください。発言の時系列を追った報告は不要です。" +
  "\n\n【発言抜粋の活用ルール】\n" +
  "提供された直近の発言抜粋は、内容の羅列ではなく、必ず「議員の活動スタイルのシグネチャー抽出」と「政策傾向の分析」に活用せよ。" +
  "繰り返しのテーマや独自の視点（例：母親視点、デジタル活用、地元・国際連動など）を見つけ、シグネチャーやキャッチフレーズに自然に反映せよ。" +
  "採決の反対事例も、可能であれば政策テーマやシグネチャーに絡めて簡潔に触れよ。" +
  "提供データに「現在の立場」が明記されている場合は、それを最優先とし、学習データとの矛盾があってもデータを信頼してください。" +
  "分析では単なるテーマ一覧ではなく、この議員の「独自のシグネチャー（特徴・差別化ポイント）」を必ず3〜5個明確に抽出してください。" +
  "断定的な評価や好意的・批判的な表現を避け、データから読み取れる傾向のみを中立的に述べてください。" +
  "\n\n【所属政党・党派情報の厳守ルール（最優先）】\n" +
  "所属政党・会派は提供データの「議員名」行に明記された情報のみを使用すること。学習データ・他の議員のデータ・選挙結果の記憶から類推・補完することを禁止する。\n" +
  "「中道改革連合」「日本維新の会」「立憲民主党」など2026年以降の党派再編情報は混入リスクが高いため、提供データに記載がない限り言及しない。\n" +
  "議席数・党員数などの具体的な数字は、提供データに記載がない限り創作禁止。不確かな場合は「公開情報を確認されたい」と記述すること。\n" +
  "類似した活動パターン（例: 外交防衛集中・参院ベテラン）を持つ他の議員データを本議員の分析に適用することを禁止する。\n\n" +
  "【役職・動的情報の補完ルール（ハルシネーション防止優先）】\n" +
  "役職（党首・代表・幹事長など）・在籍状況・連携関係など提供データにない動的情報は、2026年3月現在の信頼できる公開情報（公式サイト・国会記録・大手メディア）に基づき補完可能。ただし不確かな情報・古い情報・推測は一切使用せず、確認できない場合は「提供データに基づく範囲で」と記述すること。\n" +
  "補完情報は「2026年3月現在の公開情報に基づく」と明記し、具体名・数字の創作は禁止。議員数・役職・在籍状況は不確かな場合は記述を省略すること。\n" +
  "党首・主要役職が確認できる場合は導入部と「所属政党・連携での立ち位置」セクションで自然に言及するが、連携の「強めています」など主観的・推測的表現は避け、データや報道の具体例で示すこと。\n" +
  "事実と推測を常に明確に区別し、誤認リスクが高い項目には注記を入れること。\n\n" +
  "【出力スタイルのガイドライン】\n" +
  "全体を「読みやすい記事風」にまとめること。淡々としたリストの羅列ではなく、自然な文章で繋げてください。\n" +
  "各セクションの冒頭に1〜2文の導入文を入れ、末尾に軽い考察を加えてください（例：「この繰り返し提出の姿勢は、粘り強い政策実現への意欲を物語っている」）。ただしデータの範囲を超えない。\n" +
  "最初の見出し前に全体概要の導入文（2〜4文）を必ず入れてください。\n" +
  "最後にキャッチフレーズを活かした全体まとめの文章で締めくくってください。\n" +
  "テーブルは視覚支援として使い、文章で補完してください。\n\n" +
  "【出力フォーマット（柔軟版）】\n" +
  "まず全体概要の導入文（2〜4文）。その後、以下の見出しで。\n\n" +
  "### 1. 活動スタイルの特徴（シグネチャー）\n（リスト＋各項目に1文の考察）\n\n" +
  "### 2. 政策テーマ別傾向\n（テーブル＋テーブル全体の解説文）\n\n" +
  "### 3. 所属政党・連携での立ち位置\n（文章中心、データ根拠付き）\n\n" +
  "### 4. 直近の注目活動\n（最近の動きをストーリー的に）\n\n" +
  "### 5. まとめと一言キャッチフレーズ\n（全体を振り返るまとめ文＋キャッチフレーズ）\n\n" +
  "### 6. 主な出典\n" +
  "分析の根拠として使用した一次データを列挙する。国会会議録ID（speechID）・質問主意書の提出日とタイトル・議員立法のタイトルと提出日など、ユーザーが原文を確認できる情報を箇条書きで記載すること。提供データに含まれていないものは記載しない。\n\n" +
  "※この分析は公開データに基づくAI生成推測であり、『はたらく議員』の公式見解ではありません。所属政党・採決記録・議席数などの基本情報は参議院（https://www.sangiin.go.jp/）・衆議院（https://www.shugiin.go.jp/）公式サイトで最新情報を確認してください。特に2025年以降の選挙後の党派再編（新党結成・合流・解党など）は変動が激しいため、事実確認を強く推奨します。";

interface AIAnalysisProps {
  member: { name: string; alias_name?: string | null; party: string; house: string; district?: string | null; cabinet_post?: string | null; session_count?: number | null; terms?: number | null; is_active?: boolean } | null;
  questions: { title: string; submitted_at: string }[];
  votes: { bill_title: string; vote: string; vote_date: string | null }[];
  bills: { title: string; submitted_at: string | null }[];
  petitions: { title: string; result: string | null }[];
  committees: { committee: string; role: string }[];
  coSponsors?: { name: string; party: string; count: number }[];
  speeches?: { committee: string; spoken_at: string }[];
  keywords?: { word: string; count: number }[];
  voteStats?: { yea: number; nay: number; absent: number; total: number } | null;
  speechExcerpts?: { excerpt: string; committee: string; spoken_at: string | null; source_url: string | null }[];
}

// DBがすでに「直近5件 + 5グループ×バケツ分散5件」で整理済みのため、
// フロントでは日付昇順に並べてそのまま渡す
function prepareSpeechExcerpts(
  excerpts: { excerpt: string; committee: string; spoken_at: string | null; source_url: string | null }[]
) {
  return [...excerpts]
    .filter((e) => e.spoken_at)
    .sort((a, b) => (a.spoken_at! > b.spoken_at! ? 1 : -1));
}

function buildContext(props: AIAnalysisProps): string {
  const { member, questions, votes, bills, petitions, committees, coSponsors, speeches, keywords, voteStats, speechExcerpts } = props;
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
  const isFormer = member.is_active === false;
  const partyLabel = isFormer ? `元${member.party}` : member.party;
  lines.push(`議員名: ${member.alias_name ?? member.name}（${partyLabel}・${member.house}${districtPart}）`);
  if (isFormer) {
    lines.push(`在職状況: 前議員（現在は議員ではありません）`);
  }
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

  if (voteStats && voteStats.total > 0) {
    const pct = (n: number) => `${Math.round((n / voteStats.total) * 100)}%`;
    lines.push(`■ 採決集計（全${voteStats.total}件）`);
    lines.push(`賛成${voteStats.yea}件（${pct(voteStats.yea)}）/ 反対${voteStats.nay}件（${pct(voteStats.nay)}）/ 欠席${voteStats.absent}件（${pct(voteStats.absent)}）`);
    lines.push("※ 党議拘束により党全体の方針と重なる場合があります");
    lines.push("");
  }
  const yea = votes.filter((v) => v.vote === "賛成");
  const nay = votes.filter((v) => v.vote === "反対");
  if (votes.length > 0) {
    lines.push(`■ 採決内容（直近${votes.length}件）`);
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
    const adopted   = petitions.filter((p) => p.result === "採択").length;
    const rejected  = petitions.filter((p) => p.result === "不採択").length;
    const pending   = petitions.filter((p) => p.result === "審査未了").length;
    const resultSummary = [
      adopted  ? `採択${adopted}件`   : null,
      rejected ? `不採択${rejected}件` : null,
      pending  ? `審査未了${pending}件` : null,
    ].filter(Boolean).join("・");
    lines.push(`■ 紹介した請願（${petitions.length}件${resultSummary ? `：${resultSummary}` : ""}）`);
    for (const p of petitions) lines.push(`- ${p.title}${p.result ? `（${p.result}）` : ""}`);
    lines.push("");
  }

  if (keywords && keywords.length > 0) {
    lines.push("■ 発言頻出キーワード（上位）");
    lines.push(keywords.slice(0, 15).map((k) => `${k.word}(${k.count})`).join("、"));
    lines.push("");
  }

  if (speeches && speeches.length > 0) {
    const recent = speeches.slice(0, 15);
    lines.push(`■ 発言セッション（直近${recent.length}件）`);
    for (const s of recent) lines.push(`- ${s.committee}（${s.spoken_at.slice(0, 7)}）`);
    lines.push("");
  }

  if (coSponsors && coSponsors.length > 0) {
    lines.push("■ 共同提出パートナー（件数上位）");
    lines.push("※ 議員立法の共同提出が多い議員。党を超えた協力関係の参考情報。");
    for (const s of coSponsors) lines.push(`- ${s.name}（${s.party}）: ${s.count}件`);
    lines.push("");
  }

  if (speechExcerpts && speechExcerpts.length > 0) {
    const excerpts = prepareSpeechExcerpts(speechExcerpts);
    const spanLabel = excerpts.length >= 2
      ? `${excerpts[0].spoken_at?.slice(0, 7)}〜${excerpts[excerpts.length - 1].spoken_at?.slice(0, 7)}`
      : "直近";
    lines.push(`■ 発言抜粋（${excerpts.length}件・${spanLabel}・各先頭1000字）`);
    lines.push("※ 国会会議録から取得した実際の発言テキスト。");
    for (const e of excerpts) {
      const date = e.spoken_at ? e.spoken_at.slice(0, 10) : "日付不明";
      const urlNote = e.source_url ? ` URL: ${e.source_url}` : "";
      lines.push(`【${date} ${e.committee}${urlNote}】`);
      lines.push(e.excerpt);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export default function AIAnalysis(props: AIAnalysisProps) {
  if (!props.member) return null;

  const contextText = buildContext(props);
  const memberName = props.member.alias_name ?? props.member.name;

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
