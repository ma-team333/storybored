import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileJson,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut, withToken } from "../lib/api";
import { ImportWorkflowWizard } from "../components/ImportWorkflowWizard";
import { formatBytes } from "../lib/format";
import {
  healthDetail,
  healthOk,
  type EngineLoraRow,
  type EngineModelSlot,
  type Health,
  type MissingModelInfo,
  type SettingsMap,
  type StyleLora,
  type WorkflowManifest,
} from "../lib/types";
import { Badge, Button, Field, Input, Select } from "../components/ui";
import { ErrorState, Skeleton } from "../components/EmptyState";
import { useToast } from "../lib/toast";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-status-approved" : "bg-status-failed"
      }`}
    />
  );
}

/** Read an effective setting value (backend keys are lowercase). */
function getSetting(s: SettingsMap | undefined, key: string): string {
  const v = s?.effective?.[key.toLowerCase()];
  return typeof v === "string" ? v : "";
}

/** One entry of the engine_loras setting: node override or appended LoRA. */
type EngineLoraEntry = {
  node?: string;
  lora_name?: string;
  strength?: number;
  enabled?: boolean;
};

/** Parse the engine_loras setting (JSON object keyed by engine id) defensively. */
function parseEngineLorasSetting(raw: string): Record<string, EngineLoraEntry[]> {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Parse the engine_models setting (pack id → slot key → filename) defensively. */
function parseEngineModelsSetting(raw: string): Record<string, Record<string, string>> {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Parse the style_loras setting (JSON string) defensively. */
function parseStyleLoras(raw: string): StyleLora[] {
  try {
    const data = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter((s) => s && typeof s.lora_name === "string" && s.lora_name)
      .map((s) => ({
        lora_name: s.lora_name,
        strength: typeof s.strength === "number" ? s.strength : 1,
        enabled: s.enabled !== false,
      }));
  } catch {
    return [];
  }
}

/** Diff the edited stack + additions against baked values → setting entries. */
function buildEngineLoraEntries(
  stack: EngineLoraRow[],
  added: StyleLora[],
): EngineLoraEntry[] {
  const entries: EngineLoraEntry[] = [];
  for (const row of stack) {
    const e: EngineLoraEntry = { node: row.node };
    if (row.strength !== row.baked_strength) e.strength = row.strength;
    if (!row.enabled) e.enabled = false;
    if (e.strength !== undefined || e.enabled === false) entries.push(e);
  }
  for (const a of added) {
    entries.push({ lora_name: a.lora_name, strength: a.strength, enabled: a.enabled });
  }
  return entries;
}

function ModelSlotRow({
  slot,
  onPick,
}: {
  slot: EngineModelSlot;
  onPick: (key: string, value: string) => void;
}) {
  // The current value might be missing from the enum (engine offline or file
  // removed) — keep it selectable so the row never shows the wrong model.
  const options = slot.options.includes(slot.value)
    ? slot.options
    : [slot.value, ...slot.options];
  const large = new Set(slot.large_files ?? []);
  return (
    <div className="rounded-md border border-line/60 bg-ink-900 px-3 py-1.5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs text-fog">{slot.label}</span>
        <Select
          value={slot.value}
          onChange={(e) => onPick(slot.key, e.target.value)}
          className="h-8 min-w-0 flex-1 text-xs"
        >
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
              {name === slot.baked ? "（パック既定）" : ""}
              {large.has(name) ? " ⚠ 超大容量" : ""}
            </option>
          ))}
        </Select>
        {slot.value !== slot.baked && (
          <button
            onClick={() => onPick(slot.key, slot.baked)}
            className="shrink-0 text-[10px] uppercase tracking-wide text-amber-450/80 hover:text-amber-450"
            title={`パック既定（${slot.baked}）に戻す`}
          >
            変更済み — リセット
          </button>
        )}
      </div>
      {large.has(slot.value) && (
        <p className="mt-1 text-[11px] text-amber-450/90">
          このファイルは 24&nbsp;GB を超えています — 24&nbsp;GB の GPU には収まらない
          可能性があります。同じモデルの量子化版があればそちらを推奨します。
        </p>
      )}
    </div>
  );
}

function WorkflowRow({
  wf,
  availableLoras,
  modelsDirSet,
  onMakeDefault,
  onSaveLoras,
  onSaveModels,
  onDownload,
  onRemove,
}: {
  wf: WorkflowManifest;
  availableLoras: string[] | undefined;
  /** True when the shared models folder is configured (enables Download). */
  modelsDirSet: boolean;
  onMakeDefault: (wf: WorkflowManifest) => void;
  onSaveLoras: (packId: string, entries: EngineLoraEntry[]) => void;
  onSaveModels: (packId: string, slots: Record<string, string>) => void;
  onDownload: (packId: string, filenames?: string[]) => void;
  onRemove: (wf: WorkflowManifest) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stack, setStack] = useState<EngineLoraRow[]>(wf.loras ?? []);
  const [added, setAdded] = useState<StyleLora[]>(wf.added_loras ?? []);
  const [newLora, setNewLora] = useState("");

  // Resync the editor whenever the server payload changes (save/reset/refetch).
  const wfKey = JSON.stringify([wf.loras, wf.added_loras]);
  useEffect(() => {
    setStack(wf.loras ?? []);
    setAdded(wf.added_loras ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfKey]);

  const missing = wf.missing_models ?? [];
  // catalog-enriched rows; fall back to bare filenames if info is absent
  const missingInfo: MissingModelInfo[] =
    wf.missing_models_info ??
    missing.map((f) => ({ filename: f, folder: "", downloadable: false }));
  const anyDownloadable = missingInfo.some((m) => m.downloadable);
  const missingNodes = wf.missing_nodes ?? [];
  const available = wf.available !== false;
  // No missing-model list + an error means the engine itself was unreachable —
  // don't mislabel that as "missing models".
  const unreachable = !available && !!wf.error;

  const commit = (nextStack: EngineLoraRow[], nextAdded: StyleLora[]) => {
    setStack(nextStack);
    setAdded(nextAdded);
    onSaveLoras(wf.id, buildEngineLoraEntries(nextStack, nextAdded));
  };
  const pickModel = (key: string, value: string) => {
    // Rebuild the pack's whole override map from the slots: value ≠ baked → keep.
    const slots: Record<string, string> = {};
    for (const s of wf.models ?? []) {
      const v = s.key === key ? value : s.value;
      if (v && v !== s.baked) slots[s.key] = v;
    }
    onSaveModels(wf.id, slots);
  };
  const inChain = new Set([
    ...stack.map((r) => r.lora_name),
    ...added.map((a) => a.lora_name),
  ]);

  return (
    <li className="border-b border-line/50 last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown size={14} className="text-fog" />
        ) : (
          <ChevronRight size={14} className="text-fog" />
        )}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-paper">{wf.name}</span>
          {wf.description && (
            <span className="block truncate text-xs text-fog">{wf.description}</span>
          )}
        </div>
        {wf.default && <Badge tone="amber">デフォルト</Badge>}
        {(wf.loras_modified || wf.models_modified) && <Badge tone="fog">カスタム</Badge>}
        {wf.removable && <Badge tone="fog">読み込み済み</Badge>}
        <Badge tone="fog">{wf.kind}</Badge>
        {wf.median_render_s != null ? (
          <span
            title={`このマシンでの完了レンダリング ${wf.timing_samples} 件の中央値`}
          >
            <Badge tone="fog">
              ~{wf.median_render_s < 90
                ? `${Math.round(wf.median_render_s)}秒`
                : `${Math.round(wf.median_render_s / 60)}分`}
              /{wf.kind === "video" ? "クリップ" : "フレーム"}
            </Badge>
          </span>
        ) : available && (wf.fit === "tight" || wf.fit === "exceeds") ? (
          <span title={wf.fit_detail || "この GPU では低速になる可能性があります。"}>
            <Badge tone={wf.fit === "exceeds" ? "red" : "amber"}>
              この GPU では低速
            </Badge>
          </span>
        ) : (
          available &&
          wf.fit === "streams" && (
            <span title={wf.fit_detail || "この GPU ではレイヤーをストリーミング処理します — 動作はしますが低速です。"}>
              <Badge tone="fog">ストリーミング動作</Badge>
            </span>
          )
        )}
        {available ? (
          <Badge tone="green">準備完了</Badge>
        ) : unreachable ? (
          <Badge tone="amber">エンジンオフライン</Badge>
        ) : missing.length > 0 ? (
          <Badge tone="red">モデル未導入</Badge>
        ) : (
          <Badge tone="red">ノード未導入</Badge>
        )}
      </button>
      {open && (
        <div className="px-11 pb-4">
          {wf.median_render_s == null &&
            (wf.fit === "tight" || wf.fit === "exceeds" || wf.fit === "streams") && (
              <p
                className={`mb-2 text-[11px] leading-relaxed ${
                  wf.fit === "exceeds"
                    ? "text-status-failed/90"
                    : wf.fit === "streams"
                      ? "text-fog"
                      : "text-amber-450/80"
                }`}
              >
                {wf.fit_detail || "このパックのモデルは GPU の VRAM に収まらない可能性があります。"}
              </p>
            )}
          {wf.license_note && (
            <p className="mb-2 text-[11px] leading-relaxed text-amber-450/80">
              {wf.license_note}
            </p>
          )}
          {unreachable && (
            <p className="mb-2 text-xs text-status-failed/90">
              画像エンジンに接続できません — エンジンは起動していますか？上でアドレスを設定してください。
            </p>
          )}
          {!unreachable && missingInfo.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="flex-1 text-xs text-fog">
                  このエンジンには未導入のモデルファイルが必要です:
                </p>
                {anyDownloadable && modelsDirSet && (
                  <Button size="sm" onClick={() => onDownload(wf.id)}>
                    <Download size={13} /> 未導入ファイルをすべてダウンロード
                  </Button>
                )}
              </div>
              <ul className="space-y-1.5">
                {missingInfo.map((m) => (
                  <li
                    key={m.filename}
                    className="rounded-md border border-line/60 bg-ink-900 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-status-failed/90">
                        {m.filename}
                      </span>
                      {m.size_bytes != null && (
                        <span className="shrink-0 text-[10px] text-fog">
                          {formatBytes(m.size_bytes)}
                        </span>
                      )}
                      {(m.source || m.page) && (
                        <a
                          href={m.page ?? m.source}
                          target="_blank"
                          rel="noreferrer"
                          className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-amber-450/80 hover:text-amber-450"
                          title="モデルの配布ページを開く"
                        >
                          <ExternalLink size={11} /> 配布元
                        </a>
                      )}
                      {m.downloadable && modelsDirSet && (
                        <Button
                          size="sm"
                          onClick={() => onDownload(wf.id, [m.filename])}
                          title="このファイルをエンジンの models フォルダに取得します"
                        >
                          <Download size={13} /> ダウンロード
                        </Button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-fog">
                      {m.folder ? (
                        <>
                          配置先:{" "}
                          <span className="font-mono">models/{m.folder}/</span>
                        </>
                      ) : (
                        "適切なフォルダはエンジンのドキュメントを参照してください"
                      )}
                      {m.license ? ` · ${m.license}` : ""}
                    </p>
                    {m.notes && !m.downloadable && (
                      <p className="mt-0.5 text-[11px] text-fog/80">{m.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
              {anyDownloadable && !modelsDirSet && (
                <p className="mt-1.5 text-[11px] text-fog">
                  一部のファイルは自動ダウンロードできます — 上のエンジンセクションで
                  models フォルダを設定してください（StoryBored がエンジンと同じ
                  コンピューターで動作している場合に有効）。それ以外は配布元リンクから
                  取得し、表示のフォルダに手動で配置してください。
                </p>
              )}
            </div>
          )}
          {!unreachable && missingNodes.length > 0 && (
            <div className="mb-2">
              <p className="mb-1 text-xs text-fog">
                カスタムノードが不足しています — レンダリングエンジンに各ノードを
                提供するノードパックを導入し、「更新」を押してください:
              </p>
              <ul className="space-y-0.5">
                {missingNodes.map((n) => (
                  <li key={n} className="font-mono text-xs text-status-failed/90">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(wf.models ?? []).length > 0 && (
            <div className="mb-3">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fog">
                モデル
              </span>
              <div className="space-y-1.5">
                {(wf.models ?? []).map((slot) => (
                  <ModelSlotRow key={slot.key} slot={slot} onPick={pickModel} />
                ))}
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-xs font-medium uppercase tracking-wider text-fog">
              内蔵 LoRA スタック
            </span>
            <a
              className="inline-flex items-center gap-1 text-[11px] text-fog hover:text-amber-450"
              href={withToken(`/api/workflows/${wf.id}/graph?effective=true`)}
              download
              title="モデル差し替えと LoRA 編集を適用した、このエンジンの ComfyUI ワークフロー（API 形式）をダウンロード — ComfyUI にそのまま読み込めます"
            >
              <Download size={12} /> ワークフローを書き出し
            </a>
            {wf.loras_modified && (
              <Button size="sm" onClick={() => onSaveLoras(wf.id, [])}>
                パック既定にリセット
              </Button>
            )}
            {!wf.default && (
              <Button size="sm" onClick={() => onMakeDefault(wf)}>
                デフォルトに設定
              </Button>
            )}
          </div>

          {stack.length === 0 && added.length === 0 ? (
            <p className="text-xs text-fog/80">このエンジンには LoRA がありません。</p>
          ) : (
            <div className="space-y-1.5">
              {stack.map((row, i) => (
                <div
                  key={row.node}
                  className="flex items-center gap-3 rounded-md border border-line/60 bg-ink-900 px-3 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      commit(
                        stack.map((x, j) =>
                          j === i ? { ...x, enabled: e.target.checked } : x,
                        ),
                        added,
                      )
                    }
                    className="h-4 w-4 accent-amber-450"
                    title={row.enabled ? "オン — レンダリングチェーンに含まれる" : "オフ — スキップ"}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-xs ${
                      row.enabled ? "text-paper" : "text-fog"
                    }`}
                  >
                    {row.lora_name}
                  </span>
                  {row.disabled_with_character && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-fog/70">
                      @キャラクター指定時はオフ
                    </span>
                  )}
                  {/* wrapper constrains width — the Input's own w-full wins over a w-* override */}
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      step={0.05}
                      min={-5}
                      max={5}
                      value={row.strength}
                      onChange={(e) =>
                        setStack(
                          stack.map((x, j) =>
                            j === i
                              ? { ...x, strength: Number(e.target.value) || 0 }
                              : x,
                          ),
                        )
                      }
                      onBlur={() =>
                        onSaveLoras(wf.id, buildEngineLoraEntries(stack, added))
                      }
                      className="h-7 text-xs"
                      title={
                        row.strength !== row.baked_strength
                          ? `強度（パック既定 ${row.baked_strength}）`
                          : "強度"
                      }
                    />
                  </div>
                </div>
              ))}
              {added.map((a, i) => (
                <div
                  key={a.lora_name}
                  className="flex items-center gap-3 rounded-md border border-amber-450/25 bg-ink-900 px-3 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) =>
                      commit(
                        stack,
                        added.map((x, j) =>
                          j === i ? { ...x, enabled: e.target.checked } : x,
                        ),
                      )
                    }
                    className="h-4 w-4 accent-amber-450"
                  />
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-xs ${
                      a.enabled ? "text-paper" : "text-fog"
                    }`}
                  >
                    {a.lora_name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-450/80">
                    追加
                  </span>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      step={0.05}
                      min={-5}
                      max={5}
                      value={a.strength}
                      onChange={(e) =>
                        setAdded(
                          added.map((x, j) =>
                            j === i
                              ? { ...x, strength: Number(e.target.value) || 0 }
                              : x,
                          ),
                        )
                      }
                      onBlur={() =>
                        onSaveLoras(wf.id, buildEngineLoraEntries(stack, added))
                      }
                      className="h-7 text-xs"
                      title="強度"
                    />
                  </div>
                  <button
                    onClick={() =>
                      commit(
                        stack,
                        added.filter((_, j) => j !== i),
                      )
                    }
                    className="text-fog transition-colors hover:text-status-failed"
                    title="削除"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(wf.supports_loras ?? wf.supports_characters) && (
            <div className="mt-2 flex items-center gap-2">
              <Select
                value={newLora}
                onChange={(e) => setNewLora(e.target.value)}
                className="h-8 text-xs"
              >
                <option value="">
                  {availableLoras
                    ? availableLoras.length
                      ? "このエンジンに LoRA を追加…"
                      : "エンジン上に LoRA が見つかりません"
                    : "LoRA 一覧を読み込み中…"}
                </option>
                {(availableLoras ?? [])
                  .filter((name) => !inChain.has(name))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </Select>
              <Button
                size="sm"
                disabled={!newLora}
                onClick={() => {
                  if (!newLora) return;
                  commit(stack, [
                    ...added,
                    { lora_name: newLora, strength: 1.0, enabled: true },
                  ]);
                  setNewLora("");
                }}
              >
                <Plus size={14} /> 追加
              </Button>
            </div>
          )}

          {wf.removable && (
            <div className="mt-3 flex justify-end border-t border-line/50 pt-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => onRemove(wf)}
                title="この読み込み済みエンジンのファイルを削除します — すでにこのエンジンでレンダリングしたショットの画像は残ります"
              >
                <Trash2 size={13} /> このエンジンを削除
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const {
    data: health,
    isError: healthError,
    refetch: refetchHealth,
    isFetching: healthFetching,
  } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: () => apiGet<Health>("/api/health"),
    refetchInterval: 30_000,
    retry: 1,
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<SettingsMap>({
    queryKey: ["settings"],
    queryFn: () => apiGet<SettingsMap>("/api/settings"),
    retry: 1,
  });

  const { data: workflows, isError: wfError } = useQuery<WorkflowManifest[]>({
    queryKey: ["workflows"],
    queryFn: () => apiGet<WorkflowManifest[]>("/api/workflows"),
    retry: 1,
  });

  const [comfyUrl, setComfyUrl] = useState("");
  const [lorasDir, setLorasDir] = useState("");
  const [trainerDir, setTrainerDir] = useState("");
  const [modelsDir, setModelsDir] = useState("");
  const [llmUrl, setLlmUrl] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [llmKeyDirty, setLlmKeyDirty] = useState(false);
  const [llmModel, setLlmModel] = useState("");
  const [styleLoras, setStyleLoras] = useState<StyleLora[]>([]);
  const [newStyleLora, setNewStyleLora] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const keySet = settings?.effective?.llm_api_key_set === true;

  useEffect(() => {
    if (settings && !loaded) {
      setComfyUrl(getSetting(settings, "comfyui_url"));
      setLorasDir(getSetting(settings, "comfy_loras_dir"));
      setTrainerDir(getSetting(settings, "lora_factory_dir"));
      setModelsDir(getSetting(settings, "comfy_models_dir"));
      setLlmUrl(getSetting(settings, "llm_base_url"));
      setLlmModel(getSetting(settings, "llm_model"));
      setStyleLoras(parseStyleLoras(getSetting(settings, "style_loras")));
      setLoaded(true);
    }
  }, [settings, loaded]);

  const { data: availableLoras } = useQuery<string[]>({
    queryKey: ["available-loras"],
    queryFn: () => apiGet<string[]>("/api/characters/available-loras"),
    retry: 1,
  });

  const saveStyleLoras = useMutation({
    mutationFn: (next: StyleLora[]) =>
      apiPut("/api/settings", {
        values: { style_loras: next.length ? JSON.stringify(next) : "" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Toggles / add / remove persist immediately; strength persists on blur.
  const commitStyleLoras = (next: StyleLora[]) => {
    setStyleLoras(next);
    saveStyleLoras.mutate(next);
  };

  const addStyleLora = () => {
    if (!newStyleLora) return;
    commitStyleLoras([
      ...styleLoras,
      { lora_name: newStyleLora, strength: 1.0, enabled: true },
    ]);
    setNewStyleLora("");
  };

  const saveEngineLorasMut = useMutation({
    mutationFn: (next: Record<string, EngineLoraEntry[]>) =>
      apiPut("/api/settings", {
        values: { engine_loras: Object.keys(next).length ? JSON.stringify(next) : "" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => {
      toast(e.message, "error");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  // Merge one engine's entries into the whole setting (other engines untouched).
  const saveEngineLoras = (packId: string, entries: EngineLoraEntry[]) => {
    const next = parseEngineLorasSetting(getSetting(settings, "engine_loras"));
    if (entries.length) next[packId] = entries;
    else delete next[packId];
    saveEngineLorasMut.mutate(next);
  };

  const saveEngineModelsMut = useMutation({
    mutationFn: (next: Record<string, Record<string, string>>) =>
      apiPut("/api/settings", {
        values: { engine_models: Object.keys(next).length ? JSON.stringify(next) : "" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => {
      toast(e.message, "error");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  // Merge one engine's model choices into the whole setting.
  const saveEngineModels = (packId: string, slots: Record<string, string>) => {
    const next = parseEngineModelsSetting(getSetting(settings, "engine_models"));
    if (Object.keys(slots).length) next[packId] = slots;
    else delete next[packId];
    saveEngineModelsMut.mutate(next);
  };

  // Re-check availability NOW: the server drops its 60s engine cache first, so
  // models/nodes installed a moment ago show up without waiting.
  const refreshWorkflows = useMutation({
    mutationFn: () => apiGet<WorkflowManifest[]>("/api/workflows?refresh=true"),
    onSuccess: (data) => qc.setQueryData(["workflows"], data),
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Fetch missing model files into the shared models folder (io-lane jobs —
  // downloads never block renders; progress shows in the job tray).
  const downloadModels = useMutation({
    mutationFn: ({ packId, filenames }: { packId: string; filenames?: string[] }) =>
      apiPost<{ queued: number; skipped: string[] }>(
        `/api/workflows/${packId}/download-models`,
        filenames ? { filenames } : {},
      ),
    onSuccess: (data) => {
      if (data.queued > 0) {
        toast(
          `モデルファイル ${data.queued} 件をダウンロード中 — ジョブトレイで確認できます。`,
          "success",
        );
      } else if (data.skipped.length > 0) {
        toast("これらのファイルには検証済みのダウンロードがありません — メモを参考に探してください。", "error");
      } else {
        toast("ダウンロードするものがありません — 取得済みか、不足ファイルがありません。", "success");
      }
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Delete a user-imported pack's folder (shipped packs have no Remove button
  // and the server refuses them anyway).
  const removeWorkflow = useMutation({
    mutationFn: (wf: WorkflowManifest) => apiDelete(`/api/workflows/${wf.id}`),
    onSuccess: (_data, wf) => {
      toast(`${wf.name} を削除しました。`, "success");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const makeDefault = useMutation({
    mutationFn: (wf: WorkflowManifest) =>
      apiPut("/api/settings", {
        values: {
          [wf.kind === "video" ? "default_video_workflow" : "default_image_workflow"]:
            wf.id,
        },
      }),
    onSuccess: (_data, wf) => {
      toast(`${wf.name} をデフォルトの ${wf.kind === "video" ? "動画" : "画像"}エンジンに設定しました。`, "success");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const saveEngine = useMutation({
    mutationFn: () =>
      apiPut("/api/settings", {
        values: {
          comfyui_url: comfyUrl.trim(),
          comfy_loras_dir: lorasDir.trim(),
          comfy_models_dir: modelsDir.trim(),
        },
      }),
    onSuccess: () => {
      toast("設定を保存しました。", "success");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const saveTrainer = useMutation({
    mutationFn: () =>
      apiPut("/api/settings", { values: { lora_factory_dir: trainerDir.trim() } }),
    onSuccess: () => {
      toast("設定を保存しました。", "success");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["health"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const testTrainer = async () => {
    const res = await refetchHealth();
    const part = res.data?.trainer;
    if (healthOk(part)) toast("トレーナーフォルダを確認しました。", "success");
    else toast(`キャラクタートレーナー: ${healthDetail(part)}`, "error");
  };

  const testEngine = async () => {
    const res = await refetchHealth();
    const part = res.data?.comfy;
    if (healthOk(part)) toast("画像エンジンに接続できました。", "success");
    else toast(`画像エンジン: ${healthDetail(part)}`, "error");
  };

  const saveLlm = useMutation({
    mutationFn: () => {
      const values: Record<string, string> = {
        llm_base_url: llmUrl.trim(),
        llm_model: llmModel.trim(),
      };
      // The key is never echoed back — only send it when the user typed one.
      if (llmKeyDirty) values.llm_api_key = llmKey.trim();
      return apiPut("/api/settings", { values });
    },
    onSuccess: () => {
      toast("設定を保存しました。", "success");
      setLlmKeyDirty(false);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["health"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const testLlm = async () => {
    const res = await refetchHealth();
    const part = res.data?.llm;
    if (healthOk(part)) toast("文章アシスタントに接続できました。", "success");
    else toast(`文章アシスタント: ${healthDetail(part)}`, "error");
  };

  const rows: { key: string; label: string; hint: string }[] = [
    { key: "comfy", label: "画像・動画エンジン", hint: "スチルとクリップをレンダリングします" },
    { key: "llm", label: "文章アシスタント", hint: "脚本からショットリストを作成します" },
    { key: "trainer", label: "キャラクタートレーナー", hint: "エンジンに新しい顔を学習させます" },
    { key: "ffmpeg", label: "動画アセンブラー", hint: "最終的なアニマティックを組み立てます" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">設定</h1>
          <p className="mt-1 text-sm text-fog">StoryBored の接続先の管理。</p>
        </div>
        <Link
          to="/setup"
          className="flex items-center gap-1.5 text-sm font-medium text-amber-450 hover:text-amber-350"
        >
          <Wand2 size={14} /> セットアップウィザード
        </Link>
      </div>

      {healthError && (
        <div className="mb-6">
          <ErrorState onRetry={() => refetchHealth()} />
        </div>
      )}

      {/* status */}
      <section className="mb-6 overflow-hidden rounded-xl border border-line bg-ink-900/40">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">システム状態</h2>
        </header>
        <ul>
          {rows.map((r) => {
            const part = health?.[r.key];
            const ok = healthOk(part);
            return (
              <li
                key={r.key}
                className="flex items-center gap-3 border-b border-line/50 px-4 py-3 last:border-b-0"
              >
                <StatusDot ok={ok} />
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-paper">{r.label}</span>
                  <span className="block text-xs text-fog">{r.hint}</span>
                </div>
                <span className={`max-w-48 truncate text-xs ${ok ? "text-status-approved" : "text-fog"}`}>
                  {health ? healthDetail(part) : "確認中…"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* image engine config */}
      <section className="mb-6 rounded-xl border border-line bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold">画像・動画エンジン</h2>
        <p className="mt-1 text-xs text-fog">
          レンダリングエンジンの稼働先です。別のコンピューターや別のポートで動いている場合は、ここを変更してください。
        </p>
        {settingsLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-9" />
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            <Field label="画像エンジンのアドレス">
              <Input
                value={comfyUrl}
                onChange={(e) => setComfyUrl(e.target.value)}
                placeholder="http://127.0.0.1:8188"
              />
            </Field>
            <Field
              label="LoRA フォルダ"
              hint="アップロードしたキャラクターファイルがコピーされる場所です（エンジンの models/loras フォルダ）。ファイルアップロードを使う場合にのみ必要です。"
            >
              <Input
                value={lorasDir}
                onChange={(e) => setLorasDir(e.target.value)}
                placeholder="/path/to/ComfyUI/models/loras"
              />
            </Field>
            <Field
              label="エンジンの models フォルダ（任意）"
              hint="エンジンがこのコンピューター上にある場合の models ディレクトリです。不足モデルの自動ダウンロードや、大容量ファイルの警告ができるようになります。"
            >
              <Input
                value={modelsDir}
                onChange={(e) => setModelsDir(e.target.value)}
                placeholder="~/ComfyUI/models"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={testEngine} busy={healthFetching}>
                <FlaskConical size={14} /> テスト
              </Button>
              <Button
                variant="primary"
                onClick={() => saveEngine.mutate()}
                busy={saveEngine.isPending}
              >
                <Save size={14} /> 保存
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* LLM config */}
      <section className="mb-6 rounded-xl border border-line bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold">文章アシスタント</h2>
        <p className="mt-1 text-xs text-fog">
          OpenAI 互換のサービスならローカル・ホスト型どちらでも使えます。脚本分解、ストーリーモードのボード、強化（Enhance）、モーション下書きで利用します。キーを保存するとテストでも使われます。
        </p>
        {settingsLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            <Field label="サービス URL">
              <Input
                value={llmUrl}
                onChange={(e) => setLlmUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434/v1"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="API キー" hint="ローカルサービスでは空欄のままで構いません。">
                <Input
                  type="password"
                  value={llmKey}
                  onChange={(e) => {
                    setLlmKey(e.target.value);
                    setLlmKeyDirty(true);
                  }}
                  placeholder={keySet ? "••••••••（保存済み）" : "sk-…"}
                />
              </Field>
              <Field label="モデル">
                <Input
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="モデル名"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={testLlm} busy={healthFetching}>
                <FlaskConical size={14} /> テスト
              </Button>
              <Button variant="primary" onClick={() => saveLlm.mutate()} busy={saveLlm.isPending}>
                <Save size={14} /> 保存
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* trainer config */}
      <section className="mb-6 rounded-xl border border-line bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold">キャラクタートレーナー</h2>
        <p className="mt-1 text-xs text-fog">
          任意 — 写真からキャラクターを学習できるようになります。このマシン上の
          lora-factory 系のチェックアウトを指定してください（docs/TRAINING.md を参照）。
        </p>
        {settingsLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-9" />
          </div>
        ) : (
          <div className="mt-4 space-y-3.5">
            <Field label="トレーナーフォルダ">
              <Input
                value={trainerDir}
                onChange={(e) => setTrainerDir(e.target.value)}
                placeholder="/path/to/lora-factory"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={testTrainer} busy={healthFetching}>
                <FlaskConical size={14} /> テスト
              </Button>
              <Button
                variant="primary"
                onClick={() => saveTrainer.mutate()}
                busy={saveTrainer.isPending}
              >
                <Save size={14} /> 保存
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* style LoRAs */}
      <section className="mb-6 rounded-xl border border-line bg-ink-900/40 p-5">
        <h2 className="text-sm font-semibold">スタイル LoRA</h2>
        <p className="mt-1 text-xs text-fog">
          レンダリングするすべてのスチルに重ねられる見た目・スタイル系 LoRA です。いつでもオン/オフできます — キャラクターの同一性が最終的に優先されます。
        </p>
        <div className="mt-4 space-y-2">
          {styleLoras.length === 0 && (
            <p className="text-xs text-fog/80">
              まだありません — 下で LoRA を選ぶと、次のレンダリングから試せます。
            </p>
          )}
          {styleLoras.map((s, i) => (
            <div
              key={s.lora_name}
              className="flex items-center gap-3 rounded-md border border-line/60 bg-ink-900 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) =>
                  commitStyleLoras(
                    styleLoras.map((x, j) =>
                      j === i ? { ...x, enabled: e.target.checked } : x,
                    ),
                  )
                }
                className="h-4 w-4 accent-amber-450"
                title={s.enabled ? "オン — レンダリングに適用" : "オフ"}
              />
              <span
                className={`min-w-0 flex-1 truncate font-mono text-xs ${
                  s.enabled ? "text-paper" : "text-fog"
                }`}
              >
                {s.lora_name}
              </span>
              <div className="w-24 shrink-0">
                <Input
                  type="number"
                  step={0.05}
                  min={-5}
                  max={5}
                  value={s.strength}
                  onChange={(e) =>
                    setStyleLoras(
                      styleLoras.map((x, j) =>
                        j === i ? { ...x, strength: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                  onBlur={() => saveStyleLoras.mutate(styleLoras)}
                  className="h-8"
                  title="強度"
                />
              </div>
              <button
                onClick={() => commitStyleLoras(styleLoras.filter((_, j) => j !== i))}
                className="text-fog transition-colors hover:text-status-failed"
                title="削除"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Select value={newStyleLora} onChange={(e) => setNewStyleLora(e.target.value)}>
              <option value="">
                {availableLoras
                  ? availableLoras.length
                    ? "LoRA を選択…"
                    : "エンジン上に LoRA が見つかりません"
                  : "LoRA 一覧を読み込み中…"}
              </option>
              {(availableLoras ?? [])
                .filter((name) => !styleLoras.some((s) => s.lora_name === name))
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </Select>
            <Button onClick={addStyleLora} disabled={!newStyleLora}>
              <Plus size={14} /> 追加
            </Button>
          </div>
        </div>
      </section>

      {/* workflow packs */}
      <section className="overflow-hidden rounded-xl border border-line bg-ink-900/40">
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">エンジン</h2>
            <p className="mt-0.5 text-xs text-fog">
              このシステムに導入済みのレンダリングスタイルです。<em>デフォルト</em>のエンジンが、エンジンを指定しないショットをレンダリングします。行を展開するとベースモデルの差し替えや、一緒に使う LoRA の編集ができます。エンジンパックを workflows フォルダに入れるとエンジンを追加できます。
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setImportOpen(true)}
            title="ComfyUI のワークフロー書き出しから新しいエンジンを作成します"
          >
            <FileJson size={13} /> ワークフローを読み込み
          </Button>
          <Button
            size="sm"
            onClick={() => refreshWorkflows.mutate()}
            busy={refreshWorkflows.isPending}
            title="エンジンが現在持っているモデルとノードを再確認します"
          >
            <RefreshCw size={13} /> 更新
          </Button>
        </header>
        {wfError ? (
          <p className="px-4 py-6 text-center text-sm text-fog">
            エンジン一覧を読み込めませんでした — サーバーは起動していますか？
          </p>
        ) : !workflows ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : workflows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fog">エンジンパックが見つかりません。</p>
        ) : (
          <ul>
            {workflows.map((wf) => (
              <WorkflowRow
                key={wf.id}
                wf={wf}
                availableLoras={availableLoras}
                modelsDirSet={!!getSetting(settings, "comfy_models_dir")}
                onMakeDefault={(w) => makeDefault.mutate(w)}
                onSaveLoras={saveEngineLoras}
                onSaveModels={saveEngineModels}
                onDownload={(packId, filenames) =>
                  downloadModels.mutate({ packId, filenames })
                }
                onRemove={(w) => {
                  if (window.confirm(`エンジン「${w.name}」を削除しますか？`)) {
                    removeWorkflow.mutate(w);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {importOpen && <ImportWorkflowWizard onClose={() => setImportOpen(false)} />}
    </div>
  );
}
