import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Modal } from "./Modal";
import { setToken, UNAUTHORIZED_EVENT } from "../lib/api";

/** Shared-access token gate for tunnel/cloud exposure (STORYBORED_TOKEN).
 *  '?token=' is stored by api.ts before React mounts. This component only
 *  prompts when the server rejects a call (UNAUTHORIZED_EVENT). */
export function TokenGate() {
  const [needed, setNeeded] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onUnauthorized = () => setNeeded(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!needed) return null;

  const submit = () => {
    setToken(value.trim());
    window.location.reload();
  };

  return (
    <Modal title="アクセストークンが必要です" onClose={() => setNeeded(false)}>
      <div className="space-y-3.5">
        <p className="text-sm leading-relaxed text-fog">
          このサーバーはアクセストークン(STORYBORED_TOKEN)で保護されています。
          ノートブック(Colab / Kaggle)やサーバー管理者から受け取ったトークンを入力してください。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <KeyRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fog" />
            <input
              autoFocus
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="トークン"
              aria-label="アクセストークン"
              className="w-full rounded-md border border-line-bright bg-ink-800 py-2 pl-8 pr-3 text-sm text-paper placeholder:text-fog focus:outline-none focus:ring-1 focus:ring-amber-450"
            />
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-md bg-amber-450 px-3.5 py-2 text-sm font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            接続
          </button>
        </form>
        <p className="text-xs text-fog">
          トークンはこのブラウザに保存され、次回から自動で送信されます。
        </p>
      </div>
    </Modal>
  );
}
