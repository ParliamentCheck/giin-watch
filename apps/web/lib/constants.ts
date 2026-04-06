/**
 * はたらく議員 — 国会関連の定数
 * セッション番号・表示用ラベルの唯一の定義元。
 * 会期が進んだ場合はここだけを変更すれば全ページに反映される。
 */

/** 現在（最新）の国会会期番号 */
export const CURRENT_SESSION = 221;

/** 各データの収集開始回次 */
export const SPEECHES_START_SESSION   = 210;
export const QUESTIONS_START_SESSION  = 196;
export const BILLS_START_SESSION      = 208;
export const PETITIONS_START_SESSION  = 196;

/** 表示用の会期範囲文字列 */
export const SESSION_RANGE_SPEECHES  = `第${SPEECHES_START_SESSION}回〜第${CURRENT_SESSION}回国会`;
export const SESSION_RANGE_QUESTIONS = `第${QUESTIONS_START_SESSION}回〜第${CURRENT_SESSION}回国会`;
export const SESSION_RANGE_BILLS     = `第${BILLS_START_SESSION}回〜第${CURRENT_SESSION}回国会`;
