import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  FlaskConical,
  Layout as LayoutIcon,
  MonitorPlay,
  PenLine,
  Server,
  Sparkles,
  UserRound,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { Badge, Button, Field, Input, Select, Spinner } from "../components/ui";
import { formatBytes } from "../lib/format";
import { useToast } from "../lib/toast";
import type {
  CapabilityTier,
  RecommendedPack,
  SettingsMap,
  SetupProbe,
} from "../lib/types";

/* ---------------------------------------------------------------- helpers */

type Path = "have" | "need" | "none";
type StepId = "welcome" | "engine" | "assistant" | "trainer" | "summary";

const STEPS: Record<Path, StepId[]> = {
  have: ["welcome", "engine", "assistant", "trainer", "summary"],
  need: ["welcome", "engine", "assistant", "trainer", "summary"],
  // no GPU: no engine to point at, and training needs one too
  none: ["welcome", "assistant", "summary"],
};

const TIER_COPY: Record<CapabilityTier, { label: string; blurb: string }> = {
  studio: {
    label: "スタジオ級",
    blurb:
      "このカードならすべて収まります:最大級のスチルエンジン、14B 動画、キャラクター学習まで。",
  },
  "stills-hd": {
    label: "スチル HD 級",
    blurb:
      "スチルに最適で、デフォルトのエンジンが余裕で動き、軽量な動画も扱えます。14B 動画とキャラクター学習には 24 GB 級のカードが望ましいです。",
  },
  stills: {
    label: "スチル級",
    blurb:
      "高速なフォトリアル系スチルと軽量な動画クリップに向いています。重いエンジンには 16〜24 GB が必要です。",
  },
  "stills-lite": {
    label: "スチルライト級",
    blurb:
      "高速・コンパクトなスチルエンジンが動きます(下位帯では一部オフロードあり)。動画レンダリングと学習には大きなカードが必要です。",
  },
  board: {
    label: "ボードのみ",
    blurb:
      "同梱エンジンを動かせるだけのメモリを持つ GPU が報告されませんでした。ボード・脚本ツール・アニマティックの書き出しは使えますが、レンダリングはおそらく無理です。",
  },
};

function probeUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `/api/setup/probe?${qs}` : "/api/setup/probe";
}

/** Read an effective setting value. */
function getSetting(s: SettingsMap | undefined, key: string): string {
  const v = s?.effective?.[key];
  return typeof v === "string" ? v : "";
}

function StatusLine({
  status,
  okText,
}: {
  status: string;
  okText: string;
}) {
  if (status === "ok")
    return (
      <p className="flex items-center gap-1.5 text-sm text-status-approved">
        <Check size={14} /> {okText}
      </p>
    );
  const copy: Record<string, string> = {
    unreachable:
      "そのアドレスでは何も応答しませんでした。起動していますか?ポートは正しいですか?",
    unrecognized:
      "何かが応答しましたが、別のサービスのようです。アドレスとポートを確認してください。",
    unauthorized:
      "API キーが求められています。下で入力してください — 保存後にテストに使われるため、ホスト型サービスでは設定完了までこの表示が出ることがあります。",
    error: "サーバーエラーが返されました。サーバーのログを確認してください。",
    not_configured: "アドレスが未入力です。",
    missing: "そのフォルダはこのマシンに存在しません。",
  };
  return (
    <p className="text-sm text-status-failed">
      {copy[status] ?? `ステータス: ${status}`}
    </p>
  );
}

function CodeLine({ children }: { children: string }) {
  return (
    <code className="block select-all overflow-x-auto whitespace-nowrap rounded-md border border-line/60 bg-ink-950 px-2.5 py-1.5 font-mono text-[11px] text-paper">
      {children}
    </code>
  );
}

/** Collapsible "I don't have an LLM yet" panel: verified Ollama setup.
 *  `suggested` is the tier-matched model tag from the engine probe (falls
 *  back to the 9b default when the engine wasn't probed). */
function OllamaGuide({
  suggested,
  onUseDefaults,
}: {
  suggested: string;
  onUseDefaults: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line/60 bg-ink-900">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-medium text-paper hover:text-amber-350"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        LLM をまだお持ちでない場合 — セットアップする
      </button>
      {open && (
        <div className="space-y-3 border-t border-line/60 px-4 py-3 text-xs leading-relaxed text-mist">
          <p className="text-fog">
            最も簡単なのは{" "}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-amber-450 hover:text-amber-350"
            >
              Ollama <ExternalLink size={11} />
            </a>{" "}
            という無料のローカル LLM ランナーです。インストールしてモデルを pull すれば完成です:
          </p>
          <div className="space-y-1.5">
            <p className="font-medium text-paper">Linux</p>
            <CodeLine>curl -fsSL https://ollama.com/install.sh | sh</CodeLine>
            <p className="font-medium text-paper">macOS / Windows</p>
            <p className="text-fog">
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className="text-amber-450 hover:text-amber-350"
              >
                ollama.com/download
              </a>{" "}
              からインストーラをダウンロードして実行してください。
            </p>
            <p className="font-medium text-paper">その後、どの OS でも</p>
            <CodeLine>{`ollama pull ${suggested}`}</CodeLine>
          </div>
          <p className="text-fog">
            これはお使いのハードウェアに合わせた推奨モデルです。Ollama は{" "}
            <code>http://127.0.0.1:11434/v1</code>{" "}
            で応答します —{" "}
            <button
              onClick={onUseDefaults}
              className="font-medium text-amber-450 hover:text-amber-350"
            >
              下にその値を入力
            </button>{" "}
            してテストを押してください。
          </p>
          <p className="text-fog">
            リソースについての正直なメモ:デフォルトの qwen3.5:9b は 6.6 GB
            のダウンロードで、同程度の空き RAM または VRAM が必要です。qwen3.5:4b(3.4
            GB)は小型 GPU や CPU のみのマシンに向き、qwen3.5:35b-a3b(24 GB)には
            32 GB 以上の VRAM が必要です。CPU でもどこでも動きますが、遅くなります。
            Ollama はアイドル状態のモデルを数分で解放するため、レンダリングエンジンと
            GPU を共有できます。共有 GPU 環境では設定の <code>llm_keep_alive</code>{" "}
            を <code>0</code> にすると、呼び出しごとに即座に VRAM を解放します。
            ローカルで動かしたくない場合は、OpenAI 互換のホスト型 API
            でも構いません:ベース URL・モデル名・API キーを入力してください。
          </p>
        </div>
      )}
    </div>
  );
}

/** One tier-recommended engine: name, size of what's missing, one-click fetch. */
function RecommendedRow({
  rec,
  modelsDirSet,
  busy,
  onDownload,
}: {
  rec: RecommendedPack;
  modelsDirSet: boolean;
  busy: boolean;
  onDownload: (packId: string) => void;
}) {
  return (
    <div className="rounded-md border border-line/60 bg-ink-950 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-paper">
          {rec.name}
        </span>
        <Badge tone="fog">{rec.kind}</Badge>
        {rec.available ? (
          <Badge tone="green">インストール済み</Badge>
        ) : (
          <>
            {rec.download_bytes > 0 && (
              <span className="shrink-0 text-xs text-fog">
                {formatBytes(rec.download_bytes)} をダウンロード
              </span>
            )}
            {rec.downloadable && modelsDirSet && (
              <Button size="sm" busy={busy} onClick={() => onDownload(rec.id)}>
                <Download size={13} /> 不足分をダウンロード
              </Button>
            )}
          </>
        )}
      </div>
      {rec.license_note && (
        <p className="mt-1 text-[11px] leading-relaxed text-amber-450/90">
          {rec.license_note}
        </p>
      )}
    </div>
  );
}

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="sb-fade-in rounded-xl border border-line bg-ink-900/40 p-6">
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: settings } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsMap>("/api/settings"),
    retry: 1,
  });

  const [path, setPath] = useState<Path>("have");
  const [stepIdx, setStepIdx] = useState(0);
  const steps = STEPS[path];
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  // candidate values (written only on Finish)
  const [comfyUrl, setComfyUrl] = useState("");
  const [llmUrl, setLlmUrl] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [trainerDir, setTrainerDir] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (settings && !prefilled) {
      setComfyUrl(getSetting(settings, "comfyui_url") || "http://127.0.0.1:8188");
      setLlmUrl(getSetting(settings, "llm_base_url"));
      setLlmModel(getSetting(settings, "llm_model"));
      setTrainerDir(getSetting(settings, "lora_factory_dir"));
      setPrefilled(true);
    }
  }, [settings, prefilled]);

  // last successful/failed probe per step (Test buttons)
  const [engineProbe, setEngineProbe] = useState<SetupProbe | null>(null);
  const [llmProbe, setLlmProbe] = useState<SetupProbe | null>(null);
  const [trainerProbe, setTrainerProbe] = useState<SetupProbe | null>(null);

  const testEngine = useMutation({
    mutationFn: () => apiGet<SetupProbe>(probeUrl({ comfy_url: comfyUrl.trim() })),
    onSuccess: setEngineProbe,
    onError: (e: Error) => toast(e.message, "error"),
  });
  const testLlm = useMutation({
    mutationFn: () => apiGet<SetupProbe>(probeUrl({ llm_url: llmUrl.trim() })),
    onSuccess: setLlmProbe,
    onError: (e: Error) => toast(e.message, "error"),
  });
  const testTrainer = useMutation({
    mutationFn: () => apiGet<SetupProbe>(probeUrl({ trainer_dir: trainerDir.trim() })),
    onSuccess: setTrainerProbe,
    onError: (e: Error) => toast(e.message, "error"),
  });

  const finish = useMutation({
    mutationFn: () => {
      // write only what this wizard actually configured; empty = leave alone
      const values: Record<string, string> = { setup_complete: "1" };
      if (path !== "none" && comfyUrl.trim()) values.comfyui_url = comfyUrl.trim();
      if (llmUrl.trim()) {
        values.llm_base_url = llmUrl.trim();
        if (llmModel.trim()) values.llm_model = llmModel.trim();
        if (llmKey.trim()) values.llm_api_key = llmKey.trim();
      }
      if (path !== "none" && trainerDir.trim())
        values.lora_factory_dir = trainerDir.trim();
      // Preselect the tier-recommended engines as the defaults — only when
      // the user hasn't already chosen defaults, and always changeable in
      // Settings (a recommendation preselects, never locks).
      const rec = engineProbe?.recommended;
      if (rec?.image && !getSetting(settings, "default_image_workflow"))
        values.default_image_workflow = rec.image.id;
      if (rec?.video && !getSetting(settings, "default_video_workflow"))
        values.default_video_workflow = rec.video.id;
      return apiPut("/api/settings", { values });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast("セットアップ完了です。何か作ってみましょう。", "success");
      navigate("/");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const next = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));

  // one-click fetch of a recommended engine's missing files (io-lane jobs)
  const downloadModels = useMutation({
    mutationFn: (packId: string) =>
      apiPost<{ queued: number; skipped: string[] }>(
        `/api/workflows/${packId}/download-models`,
        {},
      ),
    onSuccess: (data) => {
      if (data.queued > 0) {
        toast(
          `${data.queued} 件のモデルファイルをダウンロードしています — ジョブトレイを確認してから、もう一度テストを押してください。`,
          "success",
        );
      } else {
        toast("ダウンロードするものはありません — 取得中か、不足ファイルがありません。", "success");
      }
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const engineOk = engineProbe?.comfy.status === "ok";
  const tier: CapabilityTier = engineProbe?.comfy.tier ?? "board";
  const recommended = engineProbe?.recommended ?? null;
  const recommendedPacks = recommended
    ? [recommended.image, recommended.video].filter(
        (r): r is RecommendedPack => r !== null,
      )
    : [];
  const modelsDirSet = !!getSetting(settings, "comfy_models_dir");
  const llmOk = llmProbe?.llm.status === "ok";
  const llmModels = llmProbe?.llm.models ?? [];
  const trainerOk = trainerProbe?.trainer.status === "ok";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-7">
        <h1 className="text-xl font-semibold tracking-tight">StoryBored をセットアップ</h1>
        <p className="mt-1 text-sm text-fog">
          数分で完了します。すべて任意で、後から
          <Link to="/settings" className="text-amber-450 hover:text-amber-350">
            設定
          </Link>
          でいつでも変更できます。
        </p>
      </div>

      {/* progress dots */}
      <div className="mb-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIdx
                ? "w-8 bg-amber-450"
                : i < stepIdx
                  ? "w-4 bg-amber-450/50"
                  : "w-4 bg-ink-700"
            }`}
          />
        ))}
      </div>

      {/* ------------------------------------------------ step: welcome */}
      {step === "welcome" && (
        <StepCard>
          <h2 className="text-sm font-semibold">画像はどこから調達しますか?</h2>
          <p className="mt-1 text-xs text-fog">
            StoryBored はエンジン(ComfyUI)経由でレンダリングします。このマシンでも、
            到達できる別のマシンでも構いません。
          </p>
          <div className="mt-4 space-y-2">
            {(
              [
                {
                  id: "have" as Path,
                  icon: <Server size={16} />,
                  title: "エンジンをすでに動かしている",
                  blurb: "StoryBored から接続して、GPU の性能を確認します。",
                },
                {
                  id: "need" as Path,
                  icon: <MonitorPlay size={16} />,
                  title: "これからインストールする",
                  blurb: "ComfyUI のインストール手順を案内してから接続します。",
                },
                {
                  id: "none" as Path,
                  icon: <LayoutIcon size={16} />,
                  title: "GPU なし — ボードのみ",
                  blurb:
                    "レンダリングなしで企画と構成を進めます。エンジンは後からいつでも接続できます。",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setPath(opt.id);
                  setStepIdx(1);
                }}
                className="flex w-full items-start gap-3 rounded-lg border border-line bg-ink-900 px-4 py-3 text-left transition-colors hover:border-amber-450/40"
              >
                <span className="mt-0.5 text-amber-450">{opt.icon}</span>
                <span>
                  <span className="block text-sm font-medium text-paper">
                    {opt.title}
                  </span>
                  <span className="block text-xs text-fog">{opt.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </StepCard>
      )}

      {/* ------------------------------------------------- step: engine */}
      {step === "engine" && (
        <StepCard>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu size={15} className="text-amber-450" /> エンジンを接続
          </h2>
          {path === "need" && (
            <div className="mt-3 rounded-lg border border-line/60 bg-ink-900 p-4 text-xs leading-relaxed text-mist">
              <p className="font-medium text-paper">ComfyUI のインストール</p>
              <p className="mt-1 text-fog">
                デスクトップアプリを入手するか、{" "}
                <a
                  href="https://docs.comfy.org"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-amber-450 hover:text-amber-350"
                >
                  docs.comfy.org <ExternalLink size={11} />
                </a>{" "}
                の手動インストール手順に従ってください。このマシンでも、ネットワーク上の
                GPU 搭載マシンでも動かせます。起動すると、アドレスがスタートアップログに
                表示されます(通常はポート 8188)。StoryBored のエンジンにはモデルファイルも
                必要です — StoryBored フォルダ内の <code>docs/MODELS.md</code>{" "}
                に、何をどこに置くかが書かれています。
              </p>
            </div>
          )}
          <div className="mt-4 space-y-3.5">
            <Field label="エンジンのアドレス" hint="ComfyUI の URL です。例: http://127.0.0.1:8188 — 別のマシンでも構いません。">
              <Input
                value={comfyUrl}
                onChange={(e) => {
                  setComfyUrl(e.target.value);
                  setEngineProbe(null);
                }}
                placeholder="http://127.0.0.1:8188"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button onClick={() => testEngine.mutate()} busy={testEngine.isPending}>
                <FlaskConical size={14} /> テスト
              </Button>
              {testEngine.isPending && (
                <span className="text-xs text-fog">エンジンに接続を試みています…</span>
              )}
            </div>

            {engineProbe && !testEngine.isPending && (
              <div className="space-y-3 rounded-lg border border-line/60 bg-ink-900 p-4">
                <StatusLine
                  status={engineProbe.comfy.status}
                  okText="エンジンが見つかりました。"
                />
                {engineOk && (
                  <>
                    {engineProbe.comfy.gpus.length > 0 ? (
                      <ul className="space-y-1">
                        {engineProbe.comfy.gpus.map((g) => (
                          <li
                            key={g.name}
                            className="flex items-center gap-2 text-sm text-paper"
                          >
                            <Cpu size={13} className="shrink-0 text-fog" />
                            <span className="min-w-0 flex-1 truncate">{g.name}</span>
                            {g.vram_gb != null && (
                              <span className="shrink-0 text-xs text-fog">
                                {g.vram_gb} GB
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-fog">GPU が報告されていません。</p>
                    )}
                    <p className="flex items-start gap-2 text-xs text-mist">
                      <Badge tone={tier === "board" ? "amber" : "green"}>
                        {TIER_COPY[tier].label}
                      </Badge>
                      <span>{TIER_COPY[tier].blurb}</span>
                    </p>
                    {recommendedPacks.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-fog">
                          この GPU におすすめ
                        </p>
                        <div className="space-y-1.5">
                          {recommendedPacks.map((rec) => (
                            <RecommendedRow
                              key={rec.id}
                              rec={rec}
                              modelsDirSet={modelsDirSet}
                              busy={downloadModels.isPending}
                              onDownload={(id) => downloadModels.mutate(id)}
                            />
                          ))}
                        </div>
                        {recommendedPacks.some(
                          (r) => !r.available && r.downloadable,
                        ) &&
                          !modelsDirSet && (
                            <p className="mt-1.5 text-[11px] text-fog">
                              これらのファイルはワンクリックで取得できます —
                              まず
                              <Link
                                to="/settings"
                                className="text-amber-450 hover:text-amber-350"
                              >
                                設定
                              </Link>{" "}
                              でエンジンのモデルフォルダを指定してください(StoryBored
                              がエンジンと同じマシンで動いている場合に機能します)。
                            </p>
                          )}
                        <p className="mt-1.5 text-[11px] text-fog">
                          セットアップを完了すると、これらがデフォルトのエンジンになります —
                          設定でいつでも別のものを選べます。
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-fog">
                        このシステムのエンジン
                      </p>
                      <ul className="space-y-1">
                        {engineProbe.workflows.map((w) => (
                          <li key={w.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-paper">
                                {w.name}
                              </span>
                              <Badge tone="fog">{w.kind}</Badge>
                              {w.available ? (
                                <Badge tone="green">準備完了</Badge>
                              ) : (
                                <Badge tone="red">
                                  不足ファイル {w.missing_models.length || "?"} 件
                                </Badge>
                              )}
                            </div>
                            {w.license_note && (
                              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-450/80">
                                {w.license_note}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {engineProbe.workflows.some((w) => !w.available) && (
                        <p className="mt-1.5 text-xs text-fog">
                          不足ファイルは
                          <Link
                            to="/settings"
                            className="text-amber-450 hover:text-amber-350"
                          >
                            設定
                          </Link>{" "}
                          でエンジンごとに確認できます —{" "}
                          <code>docs/MODELS.md</code> に各ファイルの入手先が書かれています。
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={back}>
                <ArrowLeft size={14} /> 戻る
              </Button>
              <div className="flex gap-2">
                {!engineOk && (
                  <Button variant="ghost" onClick={next}>
                    今はスキップ
                  </Button>
                )}
                <Button variant="primary" onClick={next} disabled={!engineOk}>
                  続ける <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        </StepCard>
      )}

      {/* ---------------------------------------------- step: assistant */}
      {step === "assistant" && (
        <StepCard>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PenLine size={15} className="text-amber-450" /> 執筆アシスタント
            <Badge tone="fog">任意</Badge>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fog">
            設定する価値があります:脚本分解、ストーリーモードのボード、雑なショットメモを
            磨く <em>強化(Enhance)</em> ボタン、動画のモーション下書きを担っています。
            スキップしても、それらを自分で書くだけです。OpenAI
            互換のサービスなら何でも動きます —{" "}
            <code>http://127.0.0.1:11434/v1</code>{" "}
            のローカル Ollama が最も簡単で、大きな GPU がなくても動きます。
          </p>
          <div className="mt-4 space-y-3.5">
            <OllamaGuide
              suggested={recommended?.llm ?? "qwen3.5:9b"}
              onUseDefaults={() => {
                setLlmUrl("http://127.0.0.1:11434/v1");
                setLlmModel(recommended?.llm ?? "qwen3.5:9b");
                setLlmProbe(null);
              }}
            />
            <Field label="サービス URL">
              <Input
                value={llmUrl}
                onChange={(e) => {
                  setLlmUrl(e.target.value);
                  setLlmProbe(null);
                }}
                placeholder="http://127.0.0.1:11434/v1"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => testLlm.mutate()}
                busy={testLlm.isPending}
                disabled={!llmUrl.trim()}
              >
                <FlaskConical size={14} /> テスト
              </Button>
            </div>
            {llmProbe && !testLlm.isPending && (
              <div className="space-y-3 rounded-lg border border-line/60 bg-ink-900 p-4">
                <StatusLine
                  status={llmProbe.llm.status}
                  okText={
                    llmModels.length
                      ? `見つかりました — ${llmModels.length} 件のモデルが利用可能です。`
                      : "見つかりました。"
                  }
                />
                {!llmOk && (
                  <p className="text-xs text-fog">
                    キーで保護されたホスト型サービスではこのテストが拒否されることがあります
                    — アドレスとキーは保存できるので、最初の脚本分解で問題があればわかります。
                  </p>
                )}
              </div>
            )}
            {llmOk && llmModels.length > 0 ? (
              <Field label="モデル">
                <Select value={llmModel} onChange={(e) => setLlmModel(e.target.value)}>
                  <option value="">モデルを選択…</option>
                  {llmModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="モデル">
                  <Input
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder="モデル名"
                  />
                </Field>
                <Field label="API キー" hint="ローカルのサービスでは空欄にしてください。">
                  <Input
                    type="password"
                    value={llmKey}
                    onChange={(e) => setLlmKey(e.target.value)}
                    placeholder="sk-…"
                  />
                </Field>
              </div>
            )}
            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={back}>
                <ArrowLeft size={14} /> 戻る
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={next}>
                  スキップ — すべて自分で書く
                </Button>
                <Button
                  variant="primary"
                  onClick={next}
                  disabled={!llmUrl.trim() || !llmModel.trim()}
                >
                  続ける <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        </StepCard>
      )}

      {/* ------------------------------------------------ step: trainer */}
      {step === "trainer" && (
        <StepCard>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound size={15} className="text-amber-450" /> キャラクター トレーナー
            <Badge tone="fog">任意</Badge>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fog">
            20〜40 枚の写真から繰り返し使うキャラクターを学習させ、どのショットでも{" "}
            <code>@handle</code>{" "}
            として呼び出せるようにします。このマシン上の外部トレーナーのチェックアウトを
            実行します — StoryBored フォルダ内の <code>docs/TRAINING.md</code>{" "}
            にセットアップ方法が書かれています。スキップしても、完成済みのキャラクター
            ファイルはいつでも読み込めます。
          </p>
          {engineProbe?.training?.note && (
            <p className="mt-3 rounded-md border border-line/60 bg-ink-900 px-3 py-2 text-xs leading-relaxed text-mist">
              <span className="font-medium text-paper">あなたの GPU: </span>
              {engineProbe.training.note}
            </p>
          )}
          <div className="mt-4 space-y-3.5">
            <Field label="トレーナーのフォルダ" hint="このマシン上の lora-factory 系チェックアウトのパスです。">
              <Input
                value={trainerDir}
                onChange={(e) => {
                  setTrainerDir(e.target.value);
                  setTrainerProbe(null);
                }}
                placeholder="/path/to/lora-factory"
              />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => testTrainer.mutate()}
                busy={testTrainer.isPending}
                disabled={!trainerDir.trim()}
              >
                <FlaskConical size={14} /> テスト
              </Button>
              {trainerProbe && !testTrainer.isPending && (
                <StatusLine
                  status={trainerProbe.trainer.status}
                  okText="フォルダが見つかりました。"
                />
              )}
            </div>
            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={back}>
                <ArrowLeft size={14} /> 戻る
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={next}>
                  スキップ
                </Button>
                <Button variant="primary" onClick={next} disabled={!trainerOk}>
                  続ける <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        </StepCard>
      )}

      {/* ------------------------------------------------ step: summary */}
      {step === "summary" && (
        <StepCard>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={15} className="text-amber-450" /> 準備完了
          </h2>
          <ul className="mt-4 space-y-2">
            <li className="flex items-center gap-3 rounded-md border border-line/60 bg-ink-900 px-3 py-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-fog">エンジン</span>
              {path === "none" ? (
                <span className="text-fog">
                  なし — まずはボードのみ。設定でいつでも接続できます
                </span>
              ) : engineOk ? (
                <span className="min-w-0 flex-1 truncate text-paper">
                  {comfyUrl} <Badge tone="green">{TIER_COPY[tier].label}</Badge>
                </span>
              ) : (
                <span className="text-fog">スキップ — 後から設定で指定できます</span>
              )}
            </li>
            <li className="flex items-center gap-3 rounded-md border border-line/60 bg-ink-900 px-3 py-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-fog">アシスタント</span>
              {llmUrl.trim() && llmModel.trim() ? (
                <span className="min-w-0 flex-1 truncate text-paper">
                  {llmModel} <span className="text-fog">({llmUrl})</span>
                </span>
              ) : (
                <span className="text-fog">
                  スキップ — 脚本分解・強化・モーション下書きはオフのままです
                </span>
              )}
            </li>
            {path !== "none" && (
              <li className="flex items-center gap-3 rounded-md border border-line/60 bg-ink-900 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 text-xs text-fog">トレーナー</span>
                {trainerDir.trim() && trainerOk ? (
                  <span className="min-w-0 flex-1 truncate text-paper">{trainerDir}</span>
                ) : (
                  <span className="text-fog">
                    スキップ — 既存のキャラクターは読み込めます
                  </span>
                )}
              </li>
            )}
          </ul>
          {path === "none" && (
            <p className="mt-3 text-xs leading-relaxed text-fog">
              エンジンなしで使える機能:ボード一式(シーン、ショット、説明文、並べ替え)、
              脚本分解{llmUrl ? "" : "(アシスタント設定後)"}
              、アニマティックの書き出し。なおアニマティックには、すでにスチルやクリップがある
              ショットしか含められません — エンジンを接続するまでは、上映用ではなく企画用の
              ツールということになります。
            </p>
          )}
          <div className="mt-5 flex justify-between">
            <Button variant="ghost" onClick={back}>
              <ArrowLeft size={14} /> 戻る
            </Button>
            <Button
              variant="primary"
              onClick={() => finish.mutate()}
              busy={finish.isPending}
            >
              <Check size={14} /> セットアップを完了
            </Button>
          </div>
        </StepCard>
      )}

      {!settings && step === "welcome" && (
        <div className="mt-4 flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
