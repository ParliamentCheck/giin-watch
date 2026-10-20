"use client";

import { createContext, useContext } from "react";

// site_settings はサーバー側（layout）で読み、ここで全ページに配る。
// 選挙セーフモードは「読めなければ ON」（フェイルセーフ）。判定は layout 側で行う。

type SiteSettings = {
  /** 選挙セーフモード。ON の間は昇順ソート・共有などの機能を出さない */
  electionSafeMode: boolean;
};

const SiteSettingsContext = createContext<SiteSettings>({ electionSafeMode: true });

export function SiteSettingsProvider({
  value,
  children,
}: {
  value: SiteSettings;
  children: React.ReactNode;
}) {
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useElectionSafeMode(): boolean {
  return useContext(SiteSettingsContext).electionSafeMode;
}
