import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { apiGet } from "../lib/api";
import { healthOk, type Health } from "../lib/types";

export function useHealth() {
  return useQuery<Health>({
    queryKey: ["health"],
    queryFn: () => apiGet<Health>("/api/health"),
    refetchInterval: 30_000,
    retry: 1,
  });
}

/** Amber strip shown when the image engine (or the whole server) is down. */
export function HealthBanner() {
  const { data, isError } = useHealth();

  let message: string | null = null;
  if (isError) {
    message =
      "StoryBored サーバーに接続できません。サーバーを起動すると、このページは自動的に復旧します。";
  } else if (data && !healthOk(data.comfy)) {
    message =
      "画像エンジンがオフラインです。ボードの編集は可能です。エンジンが復旧すると生成できるようになります。";
  }
  if (!message) return null;

  return (
    <div className="sb-fade-in mb-6 flex items-center gap-3 rounded-lg border border-amber-450/35 bg-amber-450/8 px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 text-amber-450" />
      <p className="flex-1 text-sm text-mist">{message}</p>
      {!isError && (
        <>
          <Link
            to="/setup"
            className="shrink-0 text-sm font-medium text-amber-450 hover:text-amber-350"
          >
            セットアップを実行
          </Link>
          <Link
            to="/settings"
            className="shrink-0 text-sm font-medium text-amber-450 hover:text-amber-350"
          >
            設定を確認 →
          </Link>
        </>
      )}
    </div>
  );
}
