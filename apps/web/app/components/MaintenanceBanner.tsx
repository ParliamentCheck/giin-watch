"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function MaintenanceBanner() {
  const [text, setText] = useState("");

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "maintenance_banner")
      .single()
      .then(({ data }) => {
        if (data?.value) setText(data.value);
      });
  }, []);

  if (!text) return null;
  return (
    <div style={{
      background: "#f59e0b",
      color: "#1a1a1a",
      textAlign: "center",
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 700,
      position: "sticky",
      top: 0,
      zIndex: 1000,
    }}>
      ⚠️ {text}
    </div>
  );
}
