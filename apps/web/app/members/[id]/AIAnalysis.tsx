"use client";

import { useState, useEffect } from "react";

type Provider = "openai" | "gemini";

const KEY_STORAGE: Record<Provider, string> = {
  openai: "giin_watch_ai_apikey_openai",
  gemini: "giin_watch_ai_apikey_gemini",
};
const PROVIDER_STORAGE = "giin_watch_ai_provider";
const MODEL_STORAGE    = "giin_watch_ai_model";

const MODELS: Record<Provider, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-flash-latest", label: "Flash（標準・高速）" },
    { value: "gemini-2.5-pro",       label: "Pro（高精度）" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "gpt-4o-mini（標準・低コスト）" },
    { value: "gpt-4o",      label: "gpt-4o（高精度）" },
  ],
};

const API_KEY_URLS: Record<Provider, { label: string; url: string }> = {
  openai: {
    label: "OpenAI APIキーを取得する",
    url: "https://platform.openai.com/api-keys",
  },
  gemini: {
    label: "Google AI Studio でAPIキーを取得する",
    url: "https://aistudio.google.com/app/apikey",
  },
};

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

  // データ収集範囲を質問主意書・議員立法・採決の日付から算出
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

function friendlyError(raw: string, provider: Provider): string {
  const r = raw.toLowerCase();
  if (r.includes("quota") || r.includes("limit: 0") || r.includes("rate limit") || r.includes("rate_limit")) {
    if (provider === "gemini") {
      return "APIの利用枠に達しています。しばらく待ってから再試行するか、Google AI StudioでAPIキーの状態を確認してください。";
    }
    return "APIの利用枠に達しています。OpenAIのダッシュボードでクレジット残高や利用制限をご確認ください。";
  }
  if (r.includes("invalid") && r.includes("key") || r.includes("unauthorized") || r.includes("401")) {
    return "APIキーが正しくありません。入力内容を確認してください。";
  }
  if (r.includes("permission") || r.includes("403")) {
    return "このAPIキーでは利用が許可されていません。キーの権限設定を確認してください。";
  }
  if (r.includes("network") || r.includes("fetch")) {
    return "通信エラーが発生しました。ネットワーク接続を確認してから再試行してください。";
  }
  return raw;
}

async function callOpenAI(
  apiKey: string,
  context: string,
  question: string,
  model: string,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${context}\n\n${question}` },
      ],
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const raw = (err as any)?.error?.message || `APIエラー: ${res.status}`;
    throw new Error(friendlyError(raw, "openai"));
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const text = json.choices?.[0]?.delta?.content;
        if (text) onChunk(text);
      } catch {
        /* SSEのパースエラーは無視 */
      }
    }
  }
}

async function callGemini(
  apiKey: string,
  context: string,
  question: string,
  model: string,
  onChunk: (text: string) => void
): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        { role: "user", parts: [{ text: `${context}\n\n${question}` }] },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const raw = (err as any)?.error?.message || `APIエラー: ${res.status}`;
    throw new Error(friendlyError(raw, "gemini"));
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onChunk(text);
      } catch {
        /* SSEのパースエラーは無視 */
      }
    }
  }
}

export default function AIAnalysis(props: AIAnalysisProps) {
  const [consented, setConsented] = useState(false);
  const [provider, setProvider] = useState<Provider>("gemini");
  const [model, setModel] = useState(MODELS.gemini[0].value);
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>({ openai: "", gemini: "" });
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveKey, setSaveKey] = useState(true);
  const [keyVisible, setKeyVisible] = useState(false);

  useEffect(() => {
    const savedOpenAI   = localStorage.getItem(KEY_STORAGE.openai) ?? "";
    const savedGemini   = localStorage.getItem(KEY_STORAGE.gemini) ?? "";
    const savedProvider = localStorage.getItem(PROVIDER_STORAGE) as Provider | null;
    const savedModel    = localStorage.getItem(MODEL_STORAGE);
    setApiKeys({ openai: savedOpenAI, gemini: savedGemini });
    if (savedProvider) setProvider(savedProvider);
    if (savedModel) setModel(savedModel);
  }, []);

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    setModel(MODELS[p][0].value);
  };

  const handleConsent = () => {
    setConsented(true);
  };

  const apiKey = apiKeys[provider];
  const setApiKey = (val: string) =>
    setApiKeys((prev) => ({ ...prev, [provider]: val }));

  const handleAnalyze = async () => {
    if (!apiKey.trim()) { setError("APIキーを入力してください"); return; }
    if (!props.member) return;

    if (saveKey) {
      localStorage.setItem(KEY_STORAGE[provider], apiKey);
      localStorage.setItem(PROVIDER_STORAGE, provider);
      localStorage.setItem(MODEL_STORAGE, model);
    }

    setResult("");
    setError("");
    setLoading(true);

    const context = buildContext(props);
    try {
      const onChunk = (chunk: string) => setResult((prev) => prev + chunk);
      if (provider === "openai") {
        await callOpenAI(apiKey, context, question, model, onChunk);
      } else {
        await callGemini(apiKey, context, question, model, onChunk);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem(KEY_STORAGE[provider]);
    setApiKeys((prev) => ({ ...prev, [provider]: "" }));
    setResult("");
    setError("");
  };

  if (!props.member) return null;

  return (
    <div className="card" style={{ padding: 20, marginTop: 16 }}>
      <h3 className="section-title" style={{ marginBottom: 4 }}>
        あなたのAIで分析する
      </h3>
      <p style={{ fontSize: 12, color: "#888888", marginBottom: 16, lineHeight: 1.7 }}>
        このページの議員活動データをあなた自身のAIに渡し、政策傾向を自由に分析できます。
      </p>

      {/* 同意前：説明と同意ボタン */}
      {!consented && (
        <div style={{
          background: "#fffbe6", border: "1px solid #f0d060", borderRadius: 8,
          padding: "16px 18px", marginBottom: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#333333" }}>
            ご利用前に以下をご確認ください
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444444", lineHeight: 2 }}>
            <li>分析はあなたが入力したAPIキーを使い、<strong>ブラウザから直接AI事業者のサーバーへ送信</strong>されます。</li>
            <li>APIキーおよび議員データは<strong>はたらく議員のサーバーには一切送信・保存されません</strong>。</li>
            <li>分析結果はAIが生成したものであり、<strong>はたらく議員の見解ではありません</strong>。内容の正確性を保証しません。</li>
            <li>AIによる分析はあくまで参考情報です。<strong>断定的な評価や序列化として受け取らない</strong>ようご注意ください。</li>
          </ul>
          <button
            onClick={handleConsent}
            style={{
              marginTop: 14, padding: "9px 20px", borderRadius: 6, border: "none",
              background: "#1a1a1a", color: "#ffffff", fontSize: 14, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            上記に同意して使用する
          </button>
        </div>
      )}

      {/* 同意後：操作UI */}
      {consented && (
        <>
          {/* プロバイダー・モデル選択 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "1px solid #cccccc",
                fontSize: 13, background: "#ffffff",
              }}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI（ChatGPT Proとは別のAPIキーが必要）</option>
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                padding: "6px 10px", borderRadius: 6, border: "1px solid #cccccc",
                fontSize: 13, background: "#ffffff",
              }}
            >
              {MODELS[provider].map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <a
              href={API_KEY_URLS[provider].url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "#555555", textDecoration: "underline" }}
            >
              {API_KEY_URLS[provider].label} ↗
            </a>
          </div>

          {/* APIキー入力 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <input
                type={keyVisible ? "text" : "password"}
                placeholder="APIキーを入力"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  width: "100%", padding: "7px 36px 7px 10px", borderRadius: 6,
                  border: "1px solid #cccccc", fontSize: 13, boxSizing: "border-box",
                }}
              />
              <button
                onClick={() => setKeyVisible((v) => !v)}
                style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#888888",
                  padding: 0, lineHeight: 1,
                }}
                aria-label={keyVisible ? "APIキーを隠す" : "APIキーを表示"}
              >
                {keyVisible ? "🙈" : "👁"}
              </button>
            </div>
            {apiKey && (
              <button
                onClick={handleClearKey}
                style={{
                  padding: "7px 12px", borderRadius: 6, border: "1px solid #cccccc",
                  background: "#ffffff", fontSize: 12, color: "#888888", cursor: "pointer",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                削除
              </button>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 12, color: "#555555", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={saveKey}
              onChange={(e) => setSaveKey(e.target.checked)}
            />
            このデバイスにAPIキーを保存する
          </label>

          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cccccc",
              fontSize: 13, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box",
              fontFamily: "inherit", marginBottom: 10,
            }}
          />

          <div style={{
            padding: "10px 14px", background: "#f0f4ff",
            border: "1px solid #c0d0f0", borderRadius: 6,
            fontSize: 12, color: "#334499", lineHeight: 1.7, marginBottom: 10,
          }}>
            💡 <strong>分析精度について：</strong>
            質問主意書・議員立法・採決記録が多い議員ほど詳細な分析が可能です。
            閣僚在任中など行政府の立場にある議員は、これらの活動が少ない傾向があるため、分析の根拠となるデータが限られます。
            また、発言データはサービスの収集範囲内のみが対象です。
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !apiKey.trim()}
            style={{
              padding: "9px 20px", borderRadius: 6, border: "none",
              background: loading || !apiKey.trim() ? "#cccccc" : "#1a1a1a",
              color: "#ffffff", fontSize: 14, fontWeight: 600,
              cursor: loading || !apiKey.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "分析中..." : "分析する"}
          </button>

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 14px", background: "#fff0f0",
              border: "1px solid #ffcccc", borderRadius: 6, fontSize: 13, color: "#cc0000",
            }}>
              {error}
            </div>
          )}

          {result && (
            <>
              <div style={{
                marginTop: 14, padding: "10px 14px",
                background: "#fffbea", border: "1px solid #f0c040", borderRadius: 6,
                fontSize: 12, color: "#7a5c00", lineHeight: 1.6,
              }}>
                ⚠️ この分析はAIが公開データから自動生成した推測です。『はたらく議員』の公式見解・評価ではありません。
              </div>
              <div style={{
                marginTop: 10, padding: "14px 16px", background: "#f9f9f9",
                border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 13, lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}>
                {result}
                {loading && <span style={{ opacity: 0.4 }}>▌</span>}
              </div>
              {!loading && (
                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      const date = new Date().toISOString().slice(0, 10);
                      const name = props.member?.name ?? "議員";
                      const disclaimer = "\n\n※この分析は、ユーザーが作成したプロンプトおよび提供したAPIキーを用いてAIが公開データから自動生成した推測であり、『はたらく議員』の公式見解・評価ではありません。";
                      const content = `【${name} / ${model} / ${date}】\n\n${result}${disclaimer}`;
                      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${name}_${model}_${date}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      padding: "6px 14px", borderRadius: 6, border: "1px solid #cccccc",
                      background: "#ffffff", fontSize: 12, color: "#555555", cursor: "pointer",
                    }}
                  >
                    分析結果のダウンロード
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
