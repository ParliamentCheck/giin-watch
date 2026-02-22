// apps/web/components/features/party-whip/hooks.ts
/**
 * 党議拘束チェッカー — データ取得フック
 * UIコンポーネントと分離し、データロジックをここに集約する。
 */

import { useState, useEffect } from "react";
import type { WhipDeviation } from "@giin-watch/types";

interface UsePartyWhipOptions {
  memberId?: string;
  party?: string;
  billId?: string;
}

export function usePartyWhip({ memberId, party, billId }: UsePartyWhipOptions) {
  const [deviations, setDeviations] = useState<WhipDeviation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (memberId) params.set("memberId", memberId);
    if (party)    params.set("party", party);
    if (billId)   params.set("billId", billId);

    fetch(`/api/party-whip/deviations?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((data) => setDeviations(data))
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [memberId, party, billId]);

  return { deviations, isLoading, error };
}
