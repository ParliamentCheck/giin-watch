"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export function useElectionSafeMode() {
  const [isSafe, setIsSafe] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "election_safe_mode")
      .single()
      .then(({ data }) => {
        setIsSafe(!!data?.value);
        setLoading(false);
      });
  }, []);

  return { isSafe, loading };
}

export function ElectionSafeBanner() {
  const { isSafe } = useElectionSafeMode();
  if (!isSafe) return null;
  return (
    <div style={{
      background: "#dc2626",
      color: "white",
      textAlign: "center",
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 700,
    }}>
      現在、選挙関連の安全措置が適用されています
    </div>
  );
}
