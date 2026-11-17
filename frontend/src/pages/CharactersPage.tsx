import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Dices,
  GraduationCap,
  ImagePlus,
  Plus,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useHealth } from "../components/HealthBanner";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPostForm,
  apiPost,
  mediaUrl,
  withToken,
} from "../lib/api";
import { healthOk, loraFamilyLabel, LORA_FAMILY_LABELS } from "../lib/types";
import type {
  Character,
  Job,
  ShootoutRow,
  TrainingInfo,
  WorkflowManifest,
} from "../lib/types";
import { handleFromName, isValidHandle, suggestTrigger } from "../lib/format";
import { EmptyState, ErrorState, Skeleton } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { Badge, Button, Field, Input, ProgressBar, Select, Spinner, TextArea } from "../components/ui";
import { useToast } from "../lib/toast";

/* ---------------- status helpers ---------------- */

function statusBadge(c: Character) {
  switch (c.status) {
    case "trained":
      return <Badge tone="green">学習済み</Badge>;
    case "training":
      return (
        <Badge tone="amber" pulse>
          学習中
        </Badge>
      );
    case "dataset":
      return <Badge tone="blue">写真準備完了</Badge>;
    default:
      return <Badge tone="fog">準備完了</Badge>;
  }
}

/* ---------------- identity fields (shared by both flows) ---------------- */

interface Identity {
  name: string;
  handle: string;
  trigger: string;
  class_word: string;
}

function IdentityFields({
  value,
  onChange,
  showTriggerDice,
}: {
  value: Identity;
  onChange: (v: Identity) => void;
  showTriggerDice?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="名前">
          <Input
            autoFocus
            value={value.name}
            placeholder="例: キャプテン・マラ"
            onChange={(e) => {
              const name = e.target.value;
              onChange({
                ...value,
                name,
                handle:
                  value.handle === handleFromName(value.name) || !value.handle
                    ? handleFromName(name)
                    : value.handle,
              });
            }}
          />
        </Field>
        <Field label="ハンドル" hint="ショットの説明文で @ハンドル を入力して呼び出せます。">
          <Input
            value={value.handle}
            onChange={(e) => onChange({ ...value, handle: handleFromName(e.target.value) })}
            placeholder="captain_mara"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="トリガーワード"
          hint="この顔に関連付ける、他と被りにくい造語です。"
        >
          <div className="flex gap-1.5">
            <Input
              value={value.trigger}
              onChange={(e) => onChange({ ...value, trigger: e.target.value })}
            />
            {showTriggerDice && (
              <Button
                type="button"
                size="md"
                onClick={() => onChange({ ...value, trigger: suggestTrigger(value.name) })}
                title="レアな単語を提案"
              >
                <Dices size={14} />
              </Button>
            )}
          </div>
        </Field>
        <Field label="クラスワード" hint="通常は person、man、woman です。">
          <Input
            value={value.class_word}
            onChange={(e) => onChange({ ...value, class_word: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/* ---------------- import existing tab ---------------- */

function ImportTab({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [identity, setIdentity] = useState<Identity>({
    name: "",
    handle: "",
    trigger: "",
    class_word: "person",
  });
  const [source, setSource] = useState<"existing" | "upload">("existing");
  const [loraName, setLoraName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [strength, setStrength] = useState("1.0");
  // "" = unspecified (works anywhere, unchecked); defaulted below to the
  // default image engine's family once the workflows load
  const [family, setFamily] = useState("");
  const [familyTouched, setFamilyTouched] = useState(false);

  const { data: available, isError: lorasError } = useQuery<string[]>({
    queryKey: ["available-loras"],
    queryFn: () => apiGet<string[]>("/api/characters/available-loras"),
    retry: 1,
  });

  const { data: workflows } = useQuery<WorkflowManifest[]>({
    queryKey: ["workflows"],
    queryFn: () => apiGet<WorkflowManifest[]>("/api/workflows"),
    staleTime: 60_000,
    retry: 1,
  });
  const defaultFamily =
    (workflows ?? []).find((w) => w.kind === "image" && w.default)?.lora_family ??
    "";
  useEffect(() => {
    if (!familyTouched && defaultFamily) setFamily(defaultFamily);
  }, [defaultFamily, familyTouched]);
  const familyOptions = Array.from(
    new Set([
      ...Object.keys(LORA_FAMILY_LABELS),
      ...(workflows ?? [])
        .map((w) => w.lora_family ?? "")
        .filter((f): f is string => !!f),
    ]),
  );

  const submit = useMutation({
    mutationFn: async () => {
      // Uploading a file first copies it where the engine can load it;
      // picking an existing entry uses its dropdown name directly.
      let finalLoraName = loraName;
      if (source === "upload" && file) {
        const form = new FormData();
        form.set("file", file);
        const res = await apiPostForm<{ lora_name: string }>(
          "/api/characters/import-lora",
          form,
        );
        finalLoraName = res.lora_name;
      }
      return apiPost<Character>("/api/characters", {
        name: identity.name.trim(),
        handle: identity.handle.trim(),
        trigger: identity.trigger.trim(),
        class_word: identity.class_word.trim() || "person",
        lora_name: finalLoraName,
        lora_strength: Number.parseFloat(strength) || 1.0,
        lora_family: family || null,
        status: "ready",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      toast(`${identity.name} をキャストに追加できるようになりました。`, "success");
      onDone();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const valid =
    identity.name.trim() &&
    isValidHandle(identity.handle) &&
    (source === "upload" ? !!file : !!loraName);

  return (
    <div className="space-y-4">
      <IdentityFields value={identity} onChange={setIdentity} />
      <Field label="キャラクターファイル">
        <div className="mb-2 flex gap-1.5">
          <Button
            size="sm"
            variant={source === "existing" ? "primary" : "outline"}
            onClick={() => setSource("existing")}
          >
            エンジン上の既存ファイル
          </Button>
          <Button
            size="sm"
            variant={source === "upload" ? "primary" : "outline"}
            onClick={() => setSource("upload")}
          >
            ファイルをアップロード
          </Button>
        </div>
        {source === "existing" ? (
          lorasError ? (
            <p className="rounded-md border border-line p-3 text-xs text-fog">
              キャラクターファイル一覧を取得できませんでした — エンジンがオフラインの可能性があります。
            </p>
          ) : (
            <Select value={loraName} onChange={(e) => setLoraName(e.target.value)}>
              <option value="">キャラクターファイルを選択…</option>
              {(available ?? []).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          )
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-fog hover:border-amber-450/40 hover:text-mist">
            <Upload size={14} />
            {file ? file.name : ".safetensors ファイルを選択"}
            <input
              type="file"
              accept=".safetensors"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="強さ" hint="キャラクターの適用強度です（通常 0.5〜1.2）。">
          <Input
            type="number"
            step={0.05}
            min={0}
            max={2}
            value={strength}
            onChange={(e) => setStrength(e.target.value)}
          />
        </Field>
        <Field
          label="対応エンジン"
          hint="キャラクターファイルは学習時のエンジンファミリーでしか使えません。"
        >
          <Select
            value={family}
            onChange={(e) => {
              setFamilyTouched(true);
              setFamily(e.target.value);
            }}
          >
            <option value="">不明 — 汎用エンジン</option>
            {familyOptions.map((f) => (
              <option key={f} value={f}>
                {loraFamilyLabel(f)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end pt-1">
        <Button variant="primary" disabled={!valid} busy={submit.isPending} onClick={() => submit.mutate()}>
          キャラクターを追加
        </Button>
      </div>
    </div>
  );
}

/* ---------------- training wizard ---------------- */

function PhotoGrid({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (fs: File[]) => void;
  onRemove: (i: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const fs = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (fs.length) onAdd(fs);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`rounded-lg border border-dashed p-3 transition-colors ${
        over ? "border-amber-450/70 bg-amber-450/5" : "border-line"
      }`}
    >
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-md border border-line">
            <img src={urls[i]} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => onRemove(i)}
              className="absolute right-0.5 top-0.5 rounded bg-ink-950/80 p-0.5 text-fog opacity-0 transition-opacity hover:text-status-failed group-hover:opacity-100"
              aria-label="写真を削除"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-fog hover:border-amber-450/40 hover:text-amber-450"
        >
          <ImagePlus size={16} />
          <span className="text-[10px]">追加</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <p className="mt-2 text-center text-xs text-fog">
        写真をドラッグするか 追加 をクリック — 明るくはっきり写った顔を、複数アングルから用意するのが最適です。
      </p>
    </div>
  );
}

function jobOfType(info: TrainingInfo | undefined, type: Job["type"]): Job | null {
  if (!info) return null;
  if (type === "dataset_prep" && info.prep_job) return info.prep_job;
  if (type === "lora_train" && info.train_job) return info.train_job;
  if (type === "lora_shootout" && info.shootout_job) return info.shootout_job;
  const list = info.jobs ?? [];
  const matches = list.filter((j) => j.type === type);
  return matches.length ? matches[matches.length - 1] : null;
}

/** After training: optional checkpoint shootout — render every saved version,
 *  score likeness + quality, and point the character at the winner. */
function ShootoutPanel({
  characterId,
  info,
  onClose,
}: {
  characterId: number;
  info: TrainingInfo;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const character = info.character;
  const shootout = jobOfType(info, "lora_shootout");

  const [strengths, setStrengths] = useState("0.7,1.0");
  const [ckpts, setCkpts] = useState("1500,2000,2500,final");
  const [seeds, setSeeds] = useState("1");
  const [rerunOpen, setRerunOpen] = useState(false);

  const start = useMutation({
    mutationFn: () =>
      apiPost(`/api/training/${characterId}/shootout`, {
        strengths: strengths.trim(),
        ckpts: ckpts.trim(),
        seeds: Number.parseInt(seeds, 10) || 1,
      }),
    onSuccess: () => {
      setRerunOpen(false);
      toast("選抜テストを開始しました — 各バージョンのテストショットをレンダリングします。", "success");
      qc.invalidateQueries({ queryKey: ["training", characterId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const apply = useMutation({
    mutationFn: (row: ShootoutRow) =>
      apiPost(`/api/training/${characterId}/shootout/apply`, {
        checkpoint: row.checkpoint,
        strength: row.strength,
      }),
    onSuccess: () => {
      toast("キャラクターをそのバージョンに切り替えました。", "success");
      qc.invalidateQueries({ queryKey: ["training", characterId] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const options = (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="強さ" hint="カンマ区切り — 強さごとにグリッドの 1 行が生成されます。">
          <Input value={strengths} onChange={(e) => setStrengths(e.target.value)} />
        </Field>
        <Field label="チェックポイント" hint="ステップ数と final。空欄で全件（時間がかかります）。">
          <Input value={ckpts} onChange={(e) => setCkpts(e.target.value)} placeholder="all" />
        </Field>
        <Field label="プロンプトあたりのショット数" hint="多いほど公平ですが遅くなります（1〜4）。">
          <Input
            type="number"
            min={1}
            max={4}
            value={seeds}
            onChange={(e) => setSeeds(e.target.value)}
          />
        </Field>
      </div>
      <Button
        variant="primary"
        className="w-full"
        busy={start.isPending}
        onClick={() => start.mutate()}
      >
        <Trophy size={15} /> 選抜テストを開始（GPU で約 10〜20 分）
      </Button>
    </div>
  );

  // running / queued
  if (shootout && (shootout.status === "running" || shootout.status === "queued")) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-paper">チェックポイント選抜テストを実行中</p>
          <p className="mt-1 text-xs text-fog">
            保存済みの各バージョンで同じテストショットをレンダリングし、類似度と画像品質で採点しています。この画面は閉じても処理は続行されます。
          </p>
        </div>
        <ProgressBar value={shootout.progress} />
        {shootout.detail && (
          <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-ink-950 p-2 text-[11px] leading-relaxed text-fog">
            {shootout.detail}
          </pre>
        )}
        <div className="flex justify-center">
          <Button onClick={onClose}>閉じる（処理は続行）</Button>
        </div>
      </div>
    );
  }

  // done → results
  if (shootout?.status === "done") {
    let results: ShootoutRow[] = [];
    let hasGrid = false;
    try {
      const parsed = JSON.parse(shootout.result_json ?? "{}");
      results = parsed.results ?? [];
      hasGrid = !!parsed.grid;
    } catch {
      /* fall through to the raw-grid fallback below */
    }
    const gridUrl = withToken(
      `/api/training/${characterId}/shootout/grid?v=${shootout.id}`,
    );
    const inUse = (row: ShootoutRow) =>
      !!character?.lora_name?.endsWith(`/${row.checkpoint}`) &&
      Math.abs((character?.lora_strength ?? 1) - row.strength) < 0.001;

    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-paper">選抜テスト結果</p>
          <p className="mt-0.5 text-xs text-fog">
            学習写真との類似度（60%）、プロンプト適合と画像のきれいさ（各 20%）で順位付けしています。目でも確認を — 選ぶ前にコンタクトシートを開きましょう。
          </p>
        </div>
        {hasGrid && (
          <a href={gridUrl} target="_blank" rel="noreferrer" title="拡大表示">
            <img
              src={gridUrl}
              alt="チェックポイント比較コンタクトシート"
              className="max-h-56 w-full rounded-md border border-line object-contain"
            />
          </a>
        )}
        {results.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-fog">
                  <th className="p-2 font-medium">バージョン</th>
                  <th className="p-2 font-medium">強さ</th>
                  <th className="p-2 font-medium">類似度</th>
                  <th className="p-2 font-medium">プロンプト</th>
                  <th className="p-2 font-medium">きれいさ</th>
                  <th className="p-2 font-medium">合計</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr
                    key={`${row.checkpoint}@${row.strength}`}
                    className={`border-b border-line last:border-0 ${
                      row.rank === 1 ? "bg-amber-450/5" : ""
                    }`}
                  >
                    <td className="p-2 text-paper">
                      <span className="inline-flex items-center gap-1.5">
                        {row.rank === 1 && <Trophy size={12} className="text-amber-450" />}
                        {row.label}
                      </span>
                      {row.no_face > 0 && (
                        <span className="ml-1.5 text-[10px] text-status-failed">
                          {row.no_face}/{row.cells} 顔なし
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-mist">{row.strength}</td>
                    <td className="p-2 text-mist">{row.likeness.toFixed(1)}</td>
                    <td className="p-2 text-mist">{row.prompt_match.toFixed(1)}</td>
                    <td className="p-2 text-mist">{row.clean.toFixed(1)}</td>
                    <td className="p-2 font-semibold text-paper">{row.total.toFixed(2)}</td>
                    <td className="p-2 text-right">
                      {inUse(row) ? (
                        <Badge tone="green">使用中</Badge>
                      ) : (
                        <Button
                          size="sm"
                          busy={apply.isPending}
                          onClick={() => apply.mutate(row)}
                        >
                          これを使う
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-md border border-line p-3 text-xs text-fog">
            スコアを読み取れませんでした — 上のコンタクトシートを目視で確認し、キャラクター編集ダイアログでバージョンを手動設定してください。
          </p>
        )}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setRerunOpen((v) => !v)}>
            設定を変えて再実行
          </Button>
          <Button variant="primary" onClick={onClose}>
            完了
          </Button>
        </div>
        {rerunOpen && options}
      </div>
    );
  }

  // failed / never run → pitch + options
  return (
    <div className="space-y-4">
      <div className="text-center">
        <Trophy size={26} className="mx-auto text-amber-450" />
        <p className="mt-2 text-sm font-medium text-paper">
          {shootout?.status === "failed" ? "選抜テストに失敗しました" : "学習が完了しました"}
        </p>
        {shootout?.status === "failed" ? (
          <p className="mx-auto mt-1 max-w-md rounded-md border border-status-failed/30 bg-status-failed/10 p-2 text-xs text-status-failed">
            {shootout.error ?? "不明なエラー"}
          </p>
        ) : (
          <p className="mx-auto mt-1 max-w-md text-xs text-fog">
            このキャラクターはすぐ使えます — どのショットでも @ を付けて言及してください。任意の品質チェック: 学習では複数のバージョンが保存されており、最後のものが常に最良とは限りません。選抜テストは各バージョンでテストショットをレンダリングして類似度を採点し、最良のものを選べるようにします。
          </p>
        )}
      </div>
      {options}
      <div className="flex justify-center">
        <Button variant="ghost" onClick={onClose}>
          スキップ — 最終バージョンを使用
        </Button>
      </div>
    </div>
  );
}

/** Steps 3+4: prep progress → report review → train → training progress. */
function TrainingProgressPanel({ characterId, onClose }: { characterId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: info, isError } = useQuery<TrainingInfo>({
    queryKey: ["training", characterId],
    queryFn: () => apiGet<TrainingInfo>(`/api/training/${characterId}`),
    refetchInterval: 5_000,
    retry: 1,
  });

  const startTrain = useMutation({
    mutationFn: () => apiPost(`/api/training/${characterId}/train`),
    onSuccess: () => {
      toast("学習を開始しました — 数時間かかります。", "success");
      qc.invalidateQueries({ queryKey: ["training", characterId] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (isError)
    return (
      <p className="rounded-md border border-line p-4 text-sm text-fog">
        学習ステータスを読み込めませんでした — サーバーが混み合っている可能性があります。自動的に再読み込みされます。
      </p>
    );
  if (!info)
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-fog">
        <Spinner /> 読み込み中…
      </div>
    );

  const prep = jobOfType(info, "dataset_prep");
  const train = jobOfType(info, "lora_train");
  const report = info.report ?? info.report_md ?? null;

  // Training finished (or already-trained character reopened) → shootout panel.
  // A queued/running retrain still wins below, so only route here when the
  // latest train is done or there is no train job at all.
  if (
    train?.status === "done" ||
    (train == null && info.character?.status === "trained")
  ) {
    return <ShootoutPanel characterId={characterId} info={info} onClose={onClose} />;
  }

  // Step 4: training running
  if (train && (train.status === "running" || train.status === "queued")) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-paper">学習を実行中</p>
          <p className="mt-1 text-xs text-fog">
            GPU が学習で使用中のため、完了まで（通常約 3 時間）画像・動画生成は順番待ちになります。この画面は閉じても学習は続行されます。
          </p>
        </div>
        <ProgressBar value={train.progress} />
        {train.detail && <p className="truncate text-center text-xs text-fog">{train.detail}</p>}
        <div className="flex justify-center">
          <Button onClick={onClose}>閉じる（学習は続行）</Button>
        </div>
      </div>
    );
  }

  if (train?.status === "failed") {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-status-failed/30 bg-status-failed/10 p-3 text-sm text-status-failed">
          学習に失敗しました: {train.error ?? "不明なエラー"}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>閉じる</Button>
          <Button variant="primary" onClick={() => startTrain.mutate()} busy={startTrain.isPending}>
            再試行
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: prep running / report review
  if (prep && (prep.status === "running" || prep.status === "queued")) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm font-medium text-paper">写真を準備中…</p>
          <p className="mt-1 text-xs text-fog">
            写真の確認・トリミング・キャプション付けを実行中です。数分かかります。
          </p>
        </div>
        <ProgressBar value={prep.progress || 0.1} />
        {prep.detail && <p className="truncate text-center text-xs text-fog">{prep.detail}</p>}
      </div>
    );
  }

  if (prep?.status === "failed") {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-status-failed/30 bg-status-failed/10 p-3 text-sm text-status-failed">
          写真の準備に失敗しました: {prep.error ?? "不明なエラー"}
        </p>
        <div className="flex justify-end">
          <Button onClick={onClose}>閉じる</Button>
        </div>
      </div>
    );
  }

  // Prep done → report review + big train button
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-paper">写真の準備が完了しました</p>
        <p className="mt-0.5 text-xs text-fog">
          下のサマリーを確認し、問題なければ学習を開始してください。
        </p>
      </div>
      {report ? (
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-ink-950 p-3 text-xs leading-relaxed text-mist">
          {report}
        </pre>
      ) : (
        <p className="rounded-md border border-line p-3 text-xs text-fog">
          準備レポートはまだありません。
        </p>
      )}
      {(info.samples ?? info.sample_paths ?? []).length > 0 && (
        <div className="grid grid-cols-6 gap-1.5">
          {(info.samples ?? info.sample_paths ?? []).slice(0, 12).map((p) => {
            // GET /api/training/{id} returns `samples` as bare filenames living
            // under DATA_DIR/training/{handle}/raw — build the served path from
            // the handle. `sample_paths`, if a backend ever sends them, are
            // already DATA_DIR-relative and used as-is.
            const handle = info.character?.handle;
            const src =
              info.samples && handle
                ? mediaUrl(`training/${handle}/raw/${p}`)
                : mediaUrl(p);
            return (
              <img
                key={p}
                src={src}
                alt=""
                className="aspect-square rounded border border-line object-cover"
              />
            );
          })}
        </div>
      )}
      <Button
        variant="primary"
        className="h-11 w-full text-base"
        onClick={() => startTrain.mutate()}
        busy={startTrain.isPending}
      >
        <GraduationCap size={16} /> 学習を開始（約 3 時間）
      </Button>
    </div>
  );
}

function TrainWizard({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState<Identity>({
    name: "",
    handle: "",
    trigger: suggestTrigger(""),
    class_word: "person",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [urlsText, setUrlsText] = useState("");
  const [characterId, setCharacterId] = useState<number | null>(null);

  const urlList = urlsText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
  const total = files.length + urlList.length;

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("name", identity.name.trim());
      form.set("handle", identity.handle.trim());
      form.set("trigger", identity.trigger.trim());
      form.set("class_word", identity.class_word.trim() || "person");
      for (const f of files) form.append("images", f);
      if (urlList.length) form.set("image_urls", JSON.stringify(urlList));
      return apiPostForm<{ character: Character; job_id: number }>(
        "/api/characters/wizard",
        form,
      );
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      setCharacterId(res.character.id);
      setStep(3);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const steps = ["キャラクター", "写真", "準備", "学習"];

  return (
    <div>
      {/* step indicator */}
      <div className="mb-5 flex items-center gap-1.5">
        {steps.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                i + 1 <= step ? "bg-amber-450 text-ink-950" : "bg-ink-700 text-fog"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-xs ${i + 1 <= step ? "text-paper" : "text-fog"}`}>{label}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <IdentityFields value={identity} onChange={setIdentity} showTriggerDice />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={
                !identity.name.trim() ||
                !isValidHandle(identity.handle) ||
                !identity.trigger.trim()
              }
              onClick={() => setStep(2)}
            >
              次へ: 写真 <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-mist">{identity.name || "キャラクター"} の写真を 20〜40 枚追加してください。</p>
            <span
              className={`text-xs font-semibold ${
                total >= 20 && total <= 40
                  ? "text-status-approved"
                  : total > 0
                    ? "text-amber-450"
                    : "text-fog"
              }`}
            >
              {total} 枚
            </span>
          </div>
          <PhotoGrid
            files={files}
            onAdd={(fs) => setFiles((prev) => [...prev, ...fs].slice(0, 60))}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
          />
          <Field label="または画像リンクを貼り付け" hint="1 行に 1 つのリンク。">
            <TextArea rows={3} value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder="https://…" />
          </Field>
          {total > 0 && total < 20 && (
            <p className="text-xs text-amber-450">
              {total} 枚では少なめです — 20 枚以上でより忠実なキャラクターになります。
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> 戻る
            </Button>
            <Button
              variant="primary"
              disabled={total === 0}
              busy={submit.isPending}
              onClick={() => submit.mutate()}
            >
              写真をアップロードして準備 <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {(step === 3 || step === 4) && characterId != null && (
        <TrainingProgressPanel characterId={characterId} onClose={onDone} />
      )}
    </div>
  );
}

/* ---------------- new character modal ---------------- */

/** Shown in place of the wizard when no trainer is configured — the wizard
 *  would otherwise let you upload 40 photos before failing on submit. */
function TrainerNotConfigured({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-ink-900 p-5 text-sm">
      <p className="font-medium text-paper">学習がまだ設定されていません</p>
      <p className="mt-1.5 text-xs leading-relaxed text-fog">
        写真からのキャラクター学習には、このマシン上の外部トレーナーが必要ですが、設定されていません。StoryBored を{" "}
        <Link
          to="/settings"
          onClick={onClose}
          className="text-amber-450 hover:text-amber-350"
        >
          設定
        </Link>{" "}
        でトレーナーに接続してください（docs/TRAINING.md にセットアップ手順があります）。学習をスキップして、お手元のキャラクターファイルを 既存を取り込み タブで使うこともできます。
      </p>
    </div>
  );
}

function NewCharacterModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"import" | "train">("import");
  const { data: health } = useHealth();
  const trainerOk = healthOk(health?.trainer);
  return (
    <Modal title="新しいキャラクター" onClose={onClose} wide>
      <div className="mb-5 flex gap-1 rounded-lg border border-line p-1">
        <button
          onClick={() => setTab("import")}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            tab === "import" ? "bg-ink-700 text-paper" : "text-fog hover:text-mist"
          }`}
        >
          既存を取り込み
        </button>
        <button
          onClick={() => setTab("train")}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            tab === "train" ? "bg-ink-700 text-paper" : "text-fog hover:text-mist"
          }`}
        >
          写真から学習
        </button>
      </div>
      {tab === "import" ? (
        <ImportTab onDone={onClose} />
      ) : trainerOk ? (
        <TrainWizard onDone={onClose} />
      ) : (
        <TrainerNotConfigured onClose={onClose} />
      )}
    </Modal>
  );
}

/* ---------------- edit modal ---------------- */

function EditCharacterModal({
  character,
  onClose,
  onShootout,
}: {
  character: Character;
  onClose: () => void;
  onShootout?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [trigger, setTrigger] = useState(character.trigger);
  const [strength, setStrength] = useState(String(character.lora_strength));
  const [bio, setBio] = useState(character.bio ?? "");
  const [notes, setNotes] = useState(character.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/characters/${character.id}`, {
        trigger,
        lora_strength: parseFloat(strength) || 1.0,
        bio,
        notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const genThumb = useMutation({
    mutationFn: () =>
      apiPost<{ job_id: number; prompt: string | null; bio_used: boolean }>(
        `/api/characters/${character.id}/generate-thumbnail`,
        { bio }, // unsaved editor state wins over the stored bio
      ),
    onSuccess: (res) => {
      if (bio.trim() && !res.bio_used) {
        toast(
          `LLM に接続できず ${character.name} のバイオを肖像に反映できませんでした — 代わりに標準のスタジオ顔写真をレンダリングします。`,
          "error",
        );
      } else {
        toast(
          res.bio_used
            ? `${character.name} の肖像をバイオを反映してレンダリング中です — 完了次第カードが更新されます。`
            : `${character.name} の肖像をレンダリング中です — 完了次第カードが更新されます。`,
          "success",
        );
      }
      onClose();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <Modal title={`${character.name} を編集`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="トリガーワード">
            <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          </Field>
          <Field label="強さ">
            <Input
              type="number"
              step={0.05}
              min={0}
              max={2}
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
            />
          </Field>
        </div>
        <Field label="バイオ">
          <TextArea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="任意 — 性格、雰囲気、スタイルなど。サムネイル生成時に肖像に反映されます。"
          />
        </Field>
        <Field label="メモ">
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button
              busy={genThumb.isPending}
              disabled={!character.lora_name}
              onClick={() => genThumb.mutate()}
              title={
                character.lora_name
                  ? bio.trim()
                    ? "バイオを反映した新しい肖像をレンダリングし、カードのサムネイルに使います"
                    : "このキャラクターの LoRA で新しい肖像をレンダリングし、カードのサムネイルに使います"
                  : "LoRA が必要です — 先に学習するか取り込んでください"
              }
            >
              <ImagePlus size={14} /> サムネイルを生成
            </Button>
            {character.status === "trained" && onShootout && (
              <Button
                onClick={onShootout}
                title="学習チェックポイントを比較し、最良のバージョンを選びます"
              >
                <Trophy size={14} /> 選抜テスト
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              キャンセル
            </Button>
            <Button variant="primary" busy={save.isPending} onClick={() => save.mutate()}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- page ---------------- */

export function CharactersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [viewTrainingId, setViewTrainingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<Character[]>({
    queryKey: ["characters"],
    queryFn: () => apiGet<Character[]>("/api/characters"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/characters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
    onError: (e: Error) => toast(e.message, "error"),
  });

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">キャラクター</h1>
          <p className="mt-1 text-sm text-fog">
            キャスト一覧 — どのショットの説明でも @ を付けて呼び出せます。
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> 新しいキャラクター
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      )}
      {isError && <ErrorState onRetry={() => refetch()} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={Users}
          title="キャラクターがいません"
          body="既存ファイルからキャラクターを取り込むか、20〜40 枚の写真から新しいキャラクターを学習できます。その後 @ハンドル を入力してショットに配役しましょう。"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> 最初のキャラクターを作成
            </Button>
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((c) => (
            <div
              key={c.id}
              className="group cursor-pointer overflow-hidden rounded-xl border border-line bg-ink-900 transition-colors hover:border-line-bright"
              onClick={() =>
                c.status === "dataset" || c.status === "training"
                  ? setViewTrainingId(c.id)
                  : setEditing(c)
              }
            >
              <div className="relative aspect-square w-full bg-ink-850">
                {c.thumbnail_path ? (
                  <img
                    src={mediaUrl(c.thumbnail_path)}
                    alt={c.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AtSign size={26} className="text-ink-600" strokeWidth={1.5} />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`${c.name} をキャストから削除しますか？`)) remove.mutate(c.id);
                  }}
                  className="absolute right-1.5 top-1.5 rounded bg-ink-950/70 p-1 text-transparent transition-colors hover:!text-status-failed group-hover:text-fog"
                  title="キャラクターを削除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-sm font-semibold text-paper">{c.name}</h2>
                  {statusBadge(c)}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-fog">@{c.handle}</p>
                  {c.lora_family && (
                    <span title={`${loraFamilyLabel(c.lora_family)} エンジンで使用可能`}>
                      <Badge tone="fog">{loraFamilyLabel(c.lora_family)}</Badge>
                    </span>
                  )}
                </div>
                {c.bio?.trim() && (
                  <p className="mt-1 line-clamp-2 text-xs text-fog" title={c.bio}>
                    {c.bio}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <NewCharacterModal onClose={() => setCreating(false)} />}
      {editing && (
        <EditCharacterModal
          character={editing}
          onClose={() => setEditing(null)}
          onShootout={() => {
            setViewTrainingId(editing.id);
            setEditing(null);
          }}
        />
      )}
      {viewTrainingId != null && (
        <Modal title="キャラクター学習" onClose={() => setViewTrainingId(null)} wide>
          <TrainingProgressPanel
            characterId={viewTrainingId}
            onClose={() => setViewTrainingId(null)}
          />
        </Modal>
      )}
    </div>
  );
}
