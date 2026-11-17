import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Minus,
  Pin,
  Play,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, mediaUrl } from "../lib/api";
import { healthOk, loraFamilyLabel } from "../lib/types";
import type {
  BoardProject,
  Character,
  Job,
  Shot,
  Take,
  WorkflowManifest,
} from "../lib/types";
import { useHealth } from "./HealthBanner";
import { activeVideoJob, shotLabel, videoTake } from "../lib/format";
import { statusLabel, StatusRing } from "./StatusRing";
import { Button, Field, Input, Select, Spinner } from "./ui";
import { useToast } from "../lib/toast";
import { MentionTextarea } from "./MentionTextarea";
import { Lightbox } from "./Lightbox";
import { ErrorBoundary } from "./ErrorBoundary";

const AUTOSAVE_MS = 800;

/** Same shape the backend resolves @mentions with (handles stored lowercase). */
const MENTION_RE = /@([A-Za-z0-9_-]+)/g;

/** Characters cast in a description, resolved against the roster. */
function mentionedCharacters(
  description: string,
  roster: Character[] | undefined,
): Character[] {
  if (!roster?.length) return [];
  const handles = new Set(
    Array.from(description.matchAll(MENTION_RE), (m) => m[1].toLowerCase()),
  );
  return roster.filter((c) => handles.has(c.handle));
}

/** True when any cast character's LoRA family conflicts with the pack's.
 *  Unknown family on either side never conflicts (agnostic). */
function familyConflict(pack: WorkflowManifest, cast: Character[]): boolean {
  if (!pack.lora_family) return false;
  return cast.some((c) => c.lora_family && c.lora_family !== pack.lora_family);
}

/** "約14秒" / "約2分30秒" from seconds. */
function fmtDuration(s: number): string {
  if (s < 90) return `約${Math.round(s)}秒`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem ? `約${m}分${rem}秒` : `約${m}分`;
}

/** Option-label suffix: measured speed when known, else the modeled fit flag.
 *  Measured beats modeled — a real median silences the model's worry. */
function engineSpeedSuffix(w: WorkflowManifest): string {
  if (w.median_render_s != null) return ` (${fmtDuration(w.median_render_s)})`;
  if (w.fit === "tight" || w.fit === "exceeds") return "（この GPU では低速）";
  if (w.fit === "streams") return "（この GPU ではストリーミング動作）";
  return "";
}

function EngineSpeedHint({
  workflow,
  unit,
}: {
  workflow?: WorkflowManifest;
  unit: "frame" | "clip";
}) {
  if (!workflow) return null;
  if (workflow.median_render_s != null) {
    return (
      <p className="mt-1 text-[11px] text-fog">
        {unit === "frame" ? "1 枚" : "1 クリップ"}あたり {fmtDuration(workflow.median_render_s)}（このマシンで実測
        {workflow.timing_samples
          ? ` · ${workflow.timing_samples} 回のレンダリングから算出`
          : ""}）
      </p>
    );
  }
  if (workflow.fit === "tight" || workflow.fit === "exceeds") {
    return (
      <p
        className={`mt-1 text-[11px] leading-relaxed ${
          workflow.fit === "exceeds" ? "text-status-failed" : "text-amber-450"
        }`}
      >
        {workflow.fit_detail || "この GPU では低速になる可能性があります。"} まだこのマシンでのレンダリング実績はありません。
      </p>
    );
  }
  if (workflow.fit === "streams") {
    return (
      <p className="mt-1 text-[11px] leading-relaxed text-fog">
        {workflow.fit_detail || "この GPU ではレイヤーをストリーミング処理します。動作しますがやや遅くなります。"}
      </p>
    );
  }
  return null;
}

interface FormState {
  description: string;
  shot_type: string;
  camera: string;
  dialogue: string;
  duration_s: string;
  motion_prompt: string;
  frame_position: string;
  plate_hold: string;
}

function formFromShot(s: Shot): FormState {
  return {
    description: s.description ?? "",
    shot_type: s.shot_type ?? "",
    camera: s.camera ?? "",
    dialogue: s.dialogue ?? "",
    duration_s: String(s.duration_s ?? 4),
    motion_prompt: s.motion_prompt ?? "",
    frame_position: s.frame_position === "last" ? "last" : "first",
    plate_hold: s.plate_hold ?? "",
  };
}

function diffForm(form: FormState, shot: Shot): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (form.description !== (shot.description ?? "")) patch.description = form.description;
  if (form.shot_type !== (shot.shot_type ?? "")) patch.shot_type = form.shot_type;
  if (form.camera !== (shot.camera ?? "")) patch.camera = form.camera;
  if (form.dialogue !== (shot.dialogue ?? "")) patch.dialogue = form.dialogue;
  if (form.motion_prompt !== (shot.motion_prompt ?? "")) patch.motion_prompt = form.motion_prompt;
  if (form.frame_position !== (shot.frame_position === "last" ? "last" : "first"))
    patch.frame_position = form.frame_position;
  if (form.plate_hold !== (shot.plate_hold ?? "")) patch.plate_hold = form.plate_hold;
  const dur = parseFloat(form.duration_s);
  if (Number.isFinite(dur) && dur > 0 && dur !== shot.duration_s) patch.duration_s = dur;
  return patch;
}

/** Dynamic params from a workflow manifest (prompt/image are auto-wired). */
function ParamFields({
  workflow,
  values,
  onChange,
}: {
  workflow?: WorkflowManifest;
  values: Record<string, string>;
  onChange: (key: string, v: string) => void;
}) {
  const params = (workflow?.parameters ?? []).filter(
    (p) => p.type !== "prompt" && p.type !== "image",
  );
  if (params.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {params.map((p) => {
        const label = p.label ?? p.key;
        const val = values[p.key] ?? (p.default != null ? String(p.default) : "");
        if (p.options && p.options.length) {
          return (
            <Field key={p.key} label={label}>
              <Select value={val} onChange={(e) => onChange(p.key, e.target.value)}>
                {p.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }
        return (
          <Field key={p.key} label={label} hint={p.type === "seed" ? "空欄でランダム" : undefined}>
            <Input
              type={p.type === "int" || p.type === "float" || p.type === "seed" ? "number" : "text"}
              value={val}
              placeholder={p.type === "seed" ? "ランダム" : undefined}
              onChange={(e) => onChange(p.key, e.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}

function buildParams(
  workflow: WorkflowManifest | undefined,
  values: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of workflow?.parameters ?? []) {
    if (p.type === "prompt" || p.type === "image") continue;
    const raw = values[p.key];
    if (raw == null || raw === "") continue;
    if (p.type === "int" || p.type === "seed") {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) out[p.key] = n;
    } else if (p.type === "float") {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) out[p.key] = n;
    } else {
      out[p.key] = raw;
    }
  }
  return out;
}

function TakeTile({
  take,
  picked,
  isPlate,
  onOpen,
  onPick,
  onDelete,
  onSetPlate,
}: {
  take: Take;
  picked: boolean;
  isPlate?: boolean;
  onOpen: () => void;
  onPick: () => void;
  onDelete: () => void;
  onSetPlate?: () => void;
}) {
  const url = mediaUrl(take.thumb_path ?? take.file_path);
  return (
    <div
      className={`group relative aspect-video cursor-pointer overflow-hidden rounded-md border transition-colors ${
        picked ? "border-amber-450/70" : "border-line hover:border-line-bright"
      }`}
      onClick={onOpen}
    >
      {take.status === "pending" && (
        <div className="flex h-full w-full items-center justify-center bg-ink-850">
          <Spinner />
        </div>
      )}
      {take.status === "failed" && (
        <div
          className="flex h-full w-full items-center justify-center bg-status-failed/10 px-2 text-center"
          title={take.error ?? undefined}
        >
          <span className="text-[10px] text-status-failed">失敗</span>
        </div>
      )}
      {take.status === "done" &&
        (url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ink-850">
            <ImageIcon size={16} className="text-ink-600" />
          </div>
        ))}
      {picked && (
        <span className="absolute left-1 top-1 rounded bg-ink-950/80 p-0.5">
          <Star size={11} className="fill-amber-450 text-amber-450" />
        </span>
      )}
      {isPlate && (
        <span
          className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-ink-950/80 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-450"
          title="このテイクはシーンのプレートです。プレートホールド設定のあるショットは、このフレームにレンダリングを固定します"
        >
          <Pin size={9} /> プレート
        </span>
      )}
      {take.status === "done" && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink-950/90 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!picked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPick();
              }}
              className="rounded bg-ink-850/90 p-1 text-mist hover:text-amber-450"
              title="このテイクを選択"
            >
              <Star size={12} />
            </button>
          )}
          {onSetPlate && !isPlate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetPlate();
              }}
              className="rounded bg-ink-850/90 p-1 text-mist hover:text-amber-450"
              title="シーンのプレートに設定 — このシーンの他のショットがこのフレームにレンダリングを固定できます"
            >
              <Pin size={12} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded bg-ink-850/90 p-1 text-mist hover:text-status-failed"
            title="テイクを削除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export function ShotDrawer({
  shotId,
  board,
  onClose,
}: {
  shotId: number;
  board: BoardProject;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"stills" | "video">("stills");
  const [nTakes, setNTakes] = useState(2);
  const [imageWf, setImageWf] = useState<string>("");
  const [videoWf, setVideoWf] = useState<string>("");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState(true);

  // Locate the shot + its label on the board.
  const located = useMemo(() => {
    for (let i = 0; i < (board.scenes ?? []).length; i++) {
      const shots = board.scenes![i].shots ?? [];
      const j = shots.findIndex((s) => s.id === shotId);
      if (j !== -1)
        return { shot: shots[j], scene: board.scenes![i], label: shotLabel(i, j) };
    }
    return null;
  }, [board, shotId]);
  const shot = located?.shot;
  const scene = located?.scene;

  const { data: takes } = useQuery<Take[]>({
    queryKey: ["takes", shotId],
    queryFn: () => apiGet<Take[]>(`/api/shots/${shotId}/takes`),
    retry: 1,
  });

  const { data: workflows } = useQuery<WorkflowManifest[]>({
    queryKey: ["workflows"],
    queryFn: () => apiGet<WorkflowManifest[]>("/api/workflows"),
    staleTime: 60_000,
    retry: 1,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["jobs"],
    queryFn: () => apiGet<Job[]>("/api/jobs"),
    retry: 1,
  });

  const { data: roster } = useQuery<Character[]>({
    queryKey: ["characters"],
    queryFn: () => apiGet<Character[]>("/api/characters"),
    staleTime: 60_000,
    retry: 1,
  });

  const imageWorkflows = (workflows ?? []).filter((w) => w.kind === "image");
  const videoWorkflows = (workflows ?? []).filter((w) => w.kind === "video");
  // Preselect the configured default engine, falling back to any available one.
  const preselect = (list: WorkflowManifest[]) =>
    (
      list.find((w) => w.default && w.available !== false) ??
      list.find((w) => w.available !== false) ??
      list[0]
    ).id;
  useEffect(() => {
    if (!imageWf && imageWorkflows.length) setImageWf(preselect(imageWorkflows));
  }, [imageWorkflows, imageWf]);
  useEffect(() => {
    if (!videoWf && videoWorkflows.length) setVideoWf(preselect(videoWorkflows));
  }, [videoWorkflows, videoWf]);

  const selectedImageWf = imageWorkflows.find((w) => w.id === imageWf);
  const selectedVideoWf = videoWorkflows.find((w) => w.id === videoWf);

  /* ---- autosaving form ---- */
  const [form, setForm] = useState<FormState | null>(shot ? formFromShot(shot) : null);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  const formRef = useRef(form);
  formRef.current = form;

  // Reset form when switching to a different shot.
  const lastShotId = useRef(shotId);
  useEffect(() => {
    if (lastShotId.current !== shotId) {
      flushRef.current(); // save the outgoing shot's pending edit before we swap
      lastShotId.current = shotId;
      setForm(shotRef.current ? formFromShot(shotRef.current) : null);
      setSaved(true);
      setTab("stills");
      setLightboxIdx(null);
    } else if (!formRef.current && shotRef.current) {
      setForm(formFromShot(shotRef.current));
    }
  }, [shotId, shot]);

  const save = useMutation({
    // The patch carries its own shot id so a flush-on-close still targets the
    // shot the edit belongs to, even after shotId has moved on.
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      apiPatch(`/api/shots/${id}`, patch),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["project", board.id] });
    },
    onError: (e: Error) => toast(`保存できませんでした: ${e.message}`, "error"),
  });
  const saveRef = useRef(save);

  // Enhance / motion drafting need the writing assistant — gate the buttons
  // instead of letting a click land a guaranteed 503 toast.
  const { data: health } = useHealth();
  const llmOk = healthOk(health?.llm);
  const llmHint =
    "文章アシスタントが未設定です。設定（またはセットアップウィザード）で追加すると自動で下書きできます。";

  const enhance = useMutation({
    mutationFn: () =>
      apiPost<{ description: string }>(`/api/shots/${shotId}/enhance`, {
        description: form?.description,
        shot_type: form?.shot_type,
        camera: form?.camera,
        // so the enhanced prompt is written in the selected engine's style
        workflow_id: imageWf || undefined,
      }),
    onSuccess: (r) => {
      setForm((f) => (f ? { ...f, description: r.description } : f));
      toast("プロンプトを強化しました。確認・調整のうえ、通常の編集と同じく自動保存されます。", "success");
    },
    onError: (e: Error) => toast(`強化に失敗しました: ${e.message}`, "error"),
  });
  saveRef.current = save;

  const generateMotion = useMutation({
    mutationFn: () =>
      apiPost<{ motion_prompt: string }>(`/api/shots/${shotId}/generate-motion`, {
        description: form?.description,
        shot_type: form?.shot_type,
        camera: form?.camera,
        dialogue: form?.dialogue,
        motion_prompt: form?.motion_prompt,
        frame_position: form?.frame_position === "last" ? "last" : "first",
        // so the motion draft is written in the selected video engine's style
        workflow_id: videoWf || undefined,
      }),
    onSuccess: (r) => {
      setForm((f) => (f ? { ...f, motion_prompt: r.motion_prompt } : f));
      toast("モーションプロンプトの下書きを作成しました。確認・調整のうえ、通常の編集と同じく自動保存されます。", "success");
    },
    onError: (e: Error) => toast(`生成に失敗しました: ${e.message}`, "error"),
  });

  // The latest unsaved edit, kept so we can flush it on close / shot switch.
  const pendingRef = useRef<{ id: number; patch: Record<string, unknown> } | null>(null);
  const flush = () => {
    if (pendingRef.current) {
      saveRef.current.mutate(pendingRef.current);
      pendingRef.current = null;
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!form || !shot) return;
    const patch = diffForm(form, shot);
    if (Object.keys(patch).length === 0) {
      pendingRef.current = null;
      return;
    }
    setSaved(false);
    pendingRef.current = { id: shot.id, patch };
    const t = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [form, shot]);

  // Flush any pending edit when the drawer unmounts (close / navigate away).
  useEffect(() => () => flushRef.current(), []);

  /* ---- actions ---- */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["project", board.id] });
    qc.invalidateQueries({ queryKey: ["takes", shotId] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };

  const generate = useMutation({
    mutationFn: () =>
      apiPost(`/api/shots/${shotId}/generate`, {
        workflow_id: imageWf || undefined,
        n_takes: nTakes,
        params: buildParams(selectedImageWf, paramValues),
      }),
    onSuccess: () => {
      toast(`${nTakes} 枚のテイクをキューに追加しました。`, "success");
      invalidateAll();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const pick = useMutation({
    mutationFn: (takeId: number) => apiPost(`/api/takes/${takeId}/pick`),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast(e.message, "error"),
  });

  const setPlate = useMutation({
    mutationFn: (takeId: number) =>
      apiPatch(`/api/scenes/${scene!.id}`, { plate_take_id: takeId }),
    onSuccess: () => {
      toast(
        "シーンのプレートを設定しました。このシーンのショットはプレートホールドでレンダリングを固定できます。",
        "success",
      );
      invalidateAll();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const deleteTake = useMutation({
    mutationFn: (takeId: number) => apiDelete(`/api/takes/${takeId}`),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast(e.message, "error"),
  });

  const approve = useMutation({
    mutationFn: (un: boolean) =>
      apiPost(`/api/shots/${shotId}/${un ? "unapprove" : "approve"}`),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast(e.message, "error"),
  });

  const renderVideo = useMutation({
    mutationFn: () =>
      apiPost(`/api/shots/${shotId}/render-video`, {
        workflow_id: videoWf || undefined,
        motion_prompt: form?.motion_prompt || undefined,
        frame_position: form?.frame_position === "last" ? "last" : "first",
      }),
    onSuccess: () => {
      toast("動画レンダリングをキューに追加しました。", "success");
      invalidateAll();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const deleteShot = useMutation({
    mutationFn: () => apiDelete(`/api/shots/${shotId}`),
    onSuccess: () => {
      onClose();
      qc.invalidateQueries({ queryKey: ["project", board.id] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && lightboxIdx === null) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, lightboxIdx]);

  if (!shot || !form) return null;

  // characters cast in the live description — drives the family-compatibility
  // marks on the engine picker and the chips under the description
  const cast = mentionedCharacters(form.description, roster);

  const imageTakes = (takes ?? []).filter((t) => t.kind === "image");
  const vTake = videoTake({ ...shot, takes: takes ?? shot.takes });
  const vUrl = mediaUrl(vTake?.file_path);
  const isApproved = shot.status === "approved";
  const canApprove = shot.picked_take_id != null;

  // Video render mirrors the backend rule exactly: the shot must be approved AND
  // its picked take must be a finished still. Anything less is a guaranteed 409.
  const pickedTake = (takes ?? shot.takes ?? []).find(
    (t) => t.id === shot.picked_take_id,
  );
  const pickedDone =
    !!pickedTake && pickedTake.kind === "image" && pickedTake.status === "done";
  const videoInFlight = !!activeVideoJob(jobs, shotId) || vTake?.status === "pending";
  const canRenderVideo = isApproved && pickedDone;
  const renderHint = !isApproved
    ? "先にこのショットを承認してください — 動画は承認済みスチルからレンダリングされます。"
    : !pickedDone
      ? "先に完成したスチルを選択してください — 動画はそのスチルから始まります。"
      : null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <aside className="sb-drawer-in fixed bottom-0 right-0 top-14 z-50 flex w-full max-w-md flex-col border-l border-line-bright bg-ink-900 shadow-2xl">
        <ErrorBoundary compact>
          {/* header */}
          <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
            <StatusRing status={shot.status} />
            <h2 className="text-sm font-semibold">ショット {located?.label}</h2>
            <span className="text-xs text-fog">{statusLabel(shot.status)}</span>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-fog">
              {saved ? (
                <>
                  <Check size={12} className="text-status-approved" /> 保存済み
                </>
              ) : (
                "保存中…"
              )}
            </span>
            <button
              onClick={() => {
                if (window.confirm("このショットを削除しますか？")) deleteShot.mutate();
              }}
              className="rounded p-1 text-fog hover:text-status-failed"
              title="ショットを削除"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="rounded p-1 text-fog hover:text-paper" aria-label="閉じる">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* fields */}
            <div className="space-y-3.5">
              <Field label="説明" hint="@ を入力するとキャラクターを参照できます。">
                <div>
                  <MentionTextarea
                    value={form.description}
                    onChange={(v) => setForm((f) => (f ? { ...f, description: v } : f))}
                    rows={3}
                    placeholder="灯守が提灯を手に螺旋階段を登っていく…"
                  />
                  {cast.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {cast.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-850 px-2 py-0.5 text-[10px] text-mist"
                          title={
                            c.lora_family
                              ? `${loraFamilyLabel(c.lora_family)} 系で学習済み — ${loraFamilyLabel(c.lora_family)} 系エンジンのみこのキャラクターをレンダリングできます`
                              : "エンジン系統の記録なし — どのエンジンでも使用可能"
                          }
                        >
                          @{c.handle}
                          {c.lora_family && (
                            <span className="text-fog">
                              {loraFamilyLabel(c.lora_family)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {cast.filter((c) => c.lora_name).length >= 2 && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-450">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>
                        1 ショットに学習済みキャラクターが 2 人いると、顔が混ざり似た顔になります。1 人の @ハンドルだけを主役にし、もう 1 人は顔が写らない描写（後ろ姿・シルエット・遠景など）にするか、カットを分割してください。
                      </span>
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-fog">
                      {enhance.isPending ? "PromptSmith がメモを推敲中…" : ""}
                    </span>
                    <span title={llmOk ? undefined : llmHint}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => enhance.mutate()}
                        busy={enhance.isPending}
                        disabled={!llmOk || !form.description.trim()}
                        title="このメモを磨き上げた画像プロンプトに書き直します。結果はここに表示され、確認してから保存されます"
                      >
                        <Sparkles size={12} /> 強化
                      </Button>
                    </span>
                  </div>
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="ショットタイプ">
                  <Input
                    value={form.shot_type}
                    onChange={(e) => setForm((f) => (f ? { ...f, shot_type: e.target.value } : f))}
                    placeholder="WIDE"
                  />
                </Field>
                <Field label="カメラ">
                  <Input
                    value={form.camera}
                    onChange={(e) => setForm((f) => (f ? { ...f, camera: e.target.value } : f))}
                    placeholder="ゆっくりプッシュイン"
                  />
                </Field>
                <Field label="長さ（秒）">
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={form.duration_s}
                    onChange={(e) => setForm((f) => (f ? { ...f, duration_s: e.target.value } : f))}
                  />
                </Field>
              </div>
              <Field label="セリフ">
                <Input
                  value={form.dialogue}
                  onChange={(e) => setForm((f) => (f ? { ...f, dialogue: e.target.value } : f))}
                  placeholder="（任意）"
                />
              </Field>
            </div>

            {/* tabs */}
            <div className="mt-6 flex gap-1 border-b border-line">
              {(["stills", "video"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    tab === t
                      ? "border-amber-450 text-paper"
                      : "border-transparent text-fog hover:text-mist"
                  }`}
                >
                  {t === "stills" ? "スチル" : "動画"}
                </button>
              ))}
            </div>

            {tab === "stills" && (
              <div className="space-y-4 pt-4">
                {imageWorkflows.length > 0 ? (
                  <>
                    <Field label="エンジン">
                      <Select value={imageWf} onChange={(e) => setImageWf(e.target.value)}>
                        {imageWorkflows.map((w) => (
                          <option key={w.id} value={w.id} disabled={w.available === false}>
                            {w.name}
                            {w.default ? "（デフォルト）" : ""}
                            {w.available === false ? "（利用不可）" : ""}
                            {familyConflict(w, cast)
                              ? "（キャラクター非対応）"
                              : ""}
                            {engineSpeedSuffix(w)}
                          </option>
                        ))}
                      </Select>
                      <EngineSpeedHint workflow={selectedImageWf} unit="frame" />
                      {selectedImageWf && familyConflict(selectedImageWf, cast) && (
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-450">
                          {cast
                            .filter(
                              (c) =>
                                c.lora_family &&
                                c.lora_family !== selectedImageWf.lora_family,
                            )
                            .map((c) => `@${c.handle}`)
                            .join(", ")}{" "}
                          が系統とは異なるエンジン系統で学習されています。このエンジンの系統は{" "}
                          {loraFamilyLabel(selectedImageWf.lora_family)}
                          です。エンジンを切り替えるか、メンションを外してください。
                        </p>
                      )}
                    </Field>
                    <ParamFields
                      workflow={selectedImageWf}
                      values={paramValues}
                      onChange={(k, v) => setParamValues((p) => ({ ...p, [k]: v }))}
                    />
                    {board.continuity_enabled &&
                      scene?.plate_take_id != null &&
                      selectedImageWf?.supports_plate && (
                        <Field label="プレートホールド">
                          <Select
                            value={form.plate_hold}
                            onChange={(e) =>
                              setForm((f) =>
                                f ? { ...f, plate_hold: e.target.value } : f,
                              )
                            }
                            title="レンダリングをシーンプレートの構図にどれだけ固定するかを指定します。「強」はプレートのフレーミングも引き継ぎます（ワイドや再構築カット向け）。「中」は構図を保ちつつ構造と配色を合わせます。"
                          >
                            <option value="">オフ — プロンプトのみ</option>
                            <option value="loose">弱 — 配色と雰囲気</option>
                            <option value="medium">中 — 構造を合わせる</option>
                            <option value="tight">強 — 同じフレーミング</option>
                          </Select>
                        </Field>
                      )}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center rounded-md border border-line">
                        <button
                          className="px-2 py-2 text-fog hover:text-paper disabled:opacity-40"
                          onClick={() => setNTakes((n) => Math.max(1, n - 1))}
                          disabled={nTakes <= 1}
                          aria-label="テイクを減らす"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-14 text-center text-sm">
                          {nTakes} 枚のテイク
                        </span>
                        <button
                          className="px-2 py-2 text-fog hover:text-paper disabled:opacity-40"
                          onClick={() => setNTakes((n) => Math.min(8, n + 1))}
                          disabled={nTakes >= 8}
                          aria-label="テイクを増やす"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => generate.mutate()}
                        busy={generate.isPending}
                        disabled={selectedImageWf?.available === false}
                      >
                        <Sparkles size={14} /> 生成
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="rounded-md border border-line p-3 text-sm text-fog">
                    画像エンジンが未設定です。設定を確認してください。
                  </p>
                )}

                {imageTakes.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {imageTakes.map((t) => (
                        <TakeTile
                          key={t.id}
                          take={t}
                          picked={shot.picked_take_id === t.id}
                          isPlate={scene?.plate_take_id === t.id}
                          onOpen={() => setLightboxIdx(imageTakes.findIndex((x) => x.id === t.id))}
                          onPick={() => pick.mutate(t.id)}
                          onDelete={() => deleteTake.mutate(t.id)}
                          onSetPlate={
                            board.continuity_enabled && t.status === "done"
                              ? () => setPlate.mutate(t.id)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    <Button
                      variant={isApproved ? "outline" : "primary"}
                      className="w-full"
                      disabled={!canApprove && !isApproved}
                      onClick={() => approve.mutate(isApproved)}
                      busy={approve.isPending}
                    >
                      <CheckCircle2 size={15} />
                      {isApproved
                        ? "承認済み — クリックで承認を解除"
                        : canApprove
                          ? "このショットを承認"
                          : "テイクを選択して承認"}
                    </Button>
                  </>
                )}
                {imageTakes.length === 0 && (
                  <p className="pt-1 text-center text-xs text-fog">
                    テイクはまだありません。上でショットを記述して「生成」を押してください。
                  </p>
                )}
              </div>
            )}

            {tab === "video" && (
              <div className="space-y-4 pt-4">
                <Field
                  label="モーション"
                  hint="ショットの動き — カメラと被写体 — を記述します。"
                >
                  <div>
                    <MentionTextarea
                      value={form.motion_prompt}
                      onChange={(v) => setForm((f) => (f ? { ...f, motion_prompt: v } : f))}
                      rows={2}
                      placeholder="波が打ち寄せ光が過ぎる、ゆっくりドリーイン"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-fog">
                        {generateMotion.isPending
                          ? "PromptSmith がモーションを作成中…"
                          : ""}
                      </span>
                      <span title={llmOk ? undefined : llmHint}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => generateMotion.mutate()}
                          busy={generateMotion.isPending}
                          disabled={!llmOk || !form.description.trim()}
                          title="このショットの情報（説明・カメラ・セリフ・フレーム基準）からモーションプロンプトの下書きを作成します。結果はここに表示され、確認できます。"
                        >
                          <Sparkles size={12} /> Generate
                        </Button>
                      </span>
                    </div>
                  </div>
                </Field>
                {(selectedVideoWf?.supports_frame_position ?? false) && (
                  <Field
                    label="スチル基準"
                    hint={
                      form.frame_position === "last"
                        ? "スチルに向かって動きます — クリップの末尾がスチルになります。"
                        : "クリップはスチルから始まり、そこから動きます。"
                    }
                  >
                    <div className="flex overflow-hidden rounded-md border border-line">
                      {(
                        [
                          ["first", "先頭フレーム"],
                          ["last", "末尾フレーム"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() =>
                            setForm((f) => (f ? { ...f, frame_position: value } : f))
                          }
                          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                            form.frame_position === value
                              ? "bg-amber-450/15 text-amber-450"
                              : "text-fog hover:text-mist"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}
                {videoWorkflows.length > 0 && (
                  <Field label="エンジン">
                    <Select value={videoWf} onChange={(e) => setVideoWf(e.target.value)}>
                      {videoWorkflows.map((w) => (
                        <option key={w.id} value={w.id} disabled={w.available === false}>
                          {w.name}
                          {w.default ? "（デフォルト）" : ""}
                          {w.available === false ? "（利用不可）" : ""}
                          {engineSpeedSuffix(w)}
                        </option>
                      ))}
                    </Select>
                    <EngineSpeedHint workflow={selectedVideoWf} unit="clip" />
                  </Field>
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => renderVideo.mutate()}
                  busy={renderVideo.isPending}
                  disabled={!canRenderVideo || videoInFlight}
                >
                  <Play size={14} />{" "}
                  {videoInFlight ? "レンダリング中…" : "動画をレンダリング"}
                </Button>
                {renderHint && (
                  <p className="text-center text-xs text-fog">{renderHint}</p>
                )}
                {vTake && vTake.status === "done" && vUrl && (
                  <video src={vUrl} controls className="w-full rounded-lg border border-line" />
                )}
                {vTake && vTake.status === "pending" && (
                  <div className="flex items-center justify-center gap-2 rounded-md border border-line p-4 text-sm text-fog">
                    <Spinner size={14} /> レンダリング中…
                  </div>
                )}
                {vTake && vTake.status === "failed" && (
                  <p className="rounded-md border border-status-failed/30 bg-status-failed/10 p-3 text-xs text-status-failed">
                    {vTake.error ?? "動画のレンダリングに失敗しました。"}
                  </p>
                )}
              </div>
            )}
          </div>
        </ErrorBoundary>
      </aside>

      {lightboxIdx !== null && (
        <Lightbox
          takes={imageTakes}
          index={lightboxIdx}
          pickedId={shot.picked_take_id}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
          onPick={(t) => pick.mutate(t.id)}
        />
      )}
    </>
  );
}
