import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileJson, Upload } from "lucide-react";
import { apiPost } from "../lib/api";
import type {
  AnalyzeCandidate,
  ImportedWorkflowInfo,
  WorkflowAnalysis,
} from "../lib/types";
import { Badge, Button, Field, Input, Select, TextArea } from "./ui";
import { Modal } from "./Modal";
import { useToast } from "../lib/toast";

type Step = "file" | "map" | "name" | "done";

/** Wizard roles rendered as node dropdowns, in display order. */
const ROLE_ROWS: {
  role: string;
  label: string;
  hint: string;
  required?: boolean;
  videoOnly?: boolean;
}[] = [
  {
    role: "prompt",
    label: "プロンプト",
    hint: "ショットの説明文を書き込むノードです。",
    required: true,
  },
  { role: "seed", label: "シード", hint: "テイクごとにランダム化され、結果の再現に使われます。" },
  { role: "size", label: "サイズ", hint: "幅と高さを持つノードです。" },
  {
    role: "output",
    label: "出力",
    hint: "StoryBored が結果を読み取る保存ノードです。",
    required: true,
  },
  {
    role: "image",
    label: "スチル入力",
    hint: "ショットの承認済みスチルを受け取るノードです。",
    videoOnly: true,
  },
  { role: "length", label: "クリップ長", hint: "1 クリップのフレーム数。", videoOnly: true },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function candidateLabel(c: AnalyzeCandidate): string {
  const bits = [`ノード ${c.node}`, c.class_type ?? ""];
  if (c.role) bits.push(c.role);
  if (c.lora_name) bits.push(c.lora_name);
  if (c.preview) bits.push(`“${c.preview.slice(0, 48)}…”`);
  if (c.width != null && c.height != null) bits.push(`${c.width}×${c.height}`);
  return bits.filter(Boolean).join(" — ");
}

export function ImportWorkflowWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [step, setStep] = useState<Step>("file");
  const [fileError, setFileError] = useState("");
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);
  /** role → chosen node id ("" = not used). Seam/slot store node ids too. */
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idDirty, setIdDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [created, setCreated] = useState<ImportedWorkflowInfo | null>(null);

  const analyze = useMutation({
    mutationFn: (g: Record<string, unknown>) =>
      apiPost<WorkflowAnalysis>("/api/workflows/analyze", { graph: g }),
    onSuccess: (a, g) => {
      setGraph(g);
      setAnalysis(a);
      const next: Record<string, string> = {};
      for (const { role } of ROLE_ROWS) next[role] = a.roles[role]?.suggested?.node ?? "";
      next.seam = a.roles.seam?.suggested?.after_node ?? "";
      next.slot = a.model_slots[0]?.node ?? "";
      setPicks(next);
      setStep("map");
    },
    onError: (e: Error) => setFileError(e.message),
  });

  const readFile = (file: File) => {
    setFileError("");
    file.text().then((text) => {
      try {
        analyze.mutate(JSON.parse(text));
      } catch {
        setFileError("このファイルは JSON ではありません。ワークフローを再度書き出してからお試しください。");
      }
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const create = useMutation({
    mutationFn: () => {
      if (!analysis || !graph) throw new Error("ワークフローを解析できませんでした");
      const kind = analysis.kind;
      const cand = (role: string): AnalyzeCandidate | undefined =>
        analysis.roles[role]?.candidates.find((c) => c.node === picks[role]);
      const parameters: Record<string, unknown>[] = [];
      const prompt = cand("prompt");
      if (prompt) {
        parameters.push({
          key: "prompt",
          label: kind === "video" ? "モーションプロンプト" : "プロンプト",
          type: "prompt",
          node: prompt.node,
          input: prompt.input,
        });
      }
      const seed = cand("seed");
      if (seed) {
        parameters.push({ key: "seed", type: "seed", node: seed.node, input: seed.input });
      }
      const size = cand("size");
      if (size) {
        parameters.push(
          { key: "width", label: "幅", type: "int", node: size.node, input: "width", default: size.width },
          { key: "height", label: "高さ", type: "int", node: size.node, input: "height", default: size.height },
        );
      }
      if (kind === "video") {
        const image = cand("image");
        if (image) {
          parameters.push({
            key: "first_frame",
            label: "先頭フレーム",
            type: "image",
            node: image.node,
            input: image.input,
          });
        }
        const length = cand("length");
        if (length) {
          parameters.push({
            key: "length",
            label: "長さ（フレーム数）",
            type: "int",
            node: length.node,
            input: length.input,
            default: length.value,
          });
        }
      }
      const body: Record<string, unknown> = {
        id,
        name: name.trim(),
        kind,
        description: description.trim(),
        graph,
        parameters,
        output_node: picks.output,
      };
      if (picks.seam) {
        if (kind === "video") {
          body.lora_injection = {
            after_node: picks.seam,
            class_type: analysis.roles.seam?.suggested?.class_type ?? "LoraLoaderModelOnly",
          };
        } else {
          body.character_injection = { after_node: picks.seam };
        }
      }
      const slot = analysis.model_slots.find((s) => s.node === picks.slot);
      if (slot) {
        body.model_slots = [
          {
            key: slot.key,
            label: kind === "video" ? "動画モデル" : "ベースモデル",
            node: slot.node,
            input: slot.input,
          },
        ];
      }
      if (kind === "video" && analysis.frame_conditioning) {
        body.frame_conditioning = analysis.frame_conditioning;
      }
      return apiPost<ImportedWorkflowInfo>("/api/workflows/import", body);
    },
    onSuccess: (info) => {
      setCreated(info);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const idOk = /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
  const seamCands = analysis?.roles.seam?.candidates ?? [];

  return (
    <Modal title="ワークフローを読み込む" onClose={onClose} wide>
      {step === "file" && (
        <div>
          <p className="mb-3 text-sm text-fog">
            自分の ComfyUI ワークフローを StoryBored のエンジンにできます。ワークフローを <span className="font-medium text-paper">API 形式</span>{" "}
            で書き出してアップロードしてください。ComfyUI で開発者モード（設定 → "Enable Dev mode
            Options"）を有効にし、"Save (API Format)" を使用します。
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-fog transition-colors ${
              over ? "border-amber-450/70 bg-amber-450/5" : "border-line hover:border-fog/50"
            }`}
            onClick={() => inputRef.current?.click()}
          >
            <FileJson size={22} />
            <span className="text-sm">書き出した .json をドロップするか、クリックして選択してください</span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
              e.target.value = "";
            }}
          />
          {analyze.isPending && <p className="mt-3 text-xs text-fog">ワークフローを読み込み中…</p>}
          {fileError && <p className="mt-3 text-xs text-status-failed">{fileError}</p>}
        </div>
      )}

      {step === "map" && analysis && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <p className="flex-1 text-sm text-fog">
              StoryBored が {analysis.node_count} 個のノードを読み込み、重要なノードを推測しました。各マッピングを確認・修正してください。
            </p>
            <Badge tone="fog">{analysis.kind}</Badge>
          </div>
          {analysis.warnings.length > 0 && (
            <ul className="mb-3 space-y-1">
              {analysis.warnings.map((w) => (
                <li key={w} className="text-xs text-amber-450/90">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-3">
            {ROLE_ROWS.filter((r) => !r.videoOnly || analysis.kind === "video").map(
              ({ role, label, hint, required }) => {
                const cands = analysis.roles[role]?.candidates ?? [];
                return (
                  <Field key={role} label={label} hint={hint}>
                    <Select
                      value={picks[role] ?? ""}
                      onChange={(e) => setPicks({ ...picks, [role]: e.target.value })}
                    >
                      <option value="">
                        {required
                          ? cands.length
                            ? "ノードを選択…"
                            : "該当するノードが見つかりません"
                          : "使用しない"}
                      </option>
                      {cands.map((c) => (
                        <option key={`${c.node}-${c.input ?? ""}`} value={c.node}>
                          {candidateLabel(c)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                );
              },
            )}
            <Field
              label="スタイル・キャラクターの注入位置"
              hint="キャラクターや追加スタイル LoRA をグラフに組み込む位置です。通常は LoRA チェーンの最後、またはモデルローダーを指定します。"
            >
              <Select
                value={picks.seam ?? ""}
                onChange={(e) => setPicks({ ...picks, seam: e.target.value })}
              >
                <option value="">使用しない — キャラクターとスタイルは無効のまま</option>
                {seamCands.map((c) => (
                  <option key={c.node} value={c.node}>
                    {candidateLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            {analysis.model_slots.length > 0 && (
              <Field
                label="差し替え可能なモデル"
                hint="後から設定画面でこのエンジンのベースモデルを差し替えられます。"
              >
                <Select
                  value={picks.slot ?? ""}
                  onChange={(e) => setPicks({ ...picks, slot: e.target.value })}
                >
                  <option value="">差し替え不可</option>
                  {analysis.model_slots.map((s) => (
                    <option key={s.node} value={s.node}>
                      ノード {s.node} — {s.class_type} — {s.value}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={() => setStep("file")}>
              戻る
            </Button>
            <Button
              variant="primary"
              disabled={!picks.prompt || !picks.output}
              onClick={() => setStep("name")}
            >
              次へ
            </Button>
          </div>
        </div>
      )}

      {step === "name" && analysis && (
        <div className="space-y-3.5">
          <Field label="名前" hint="エンジン選択 UI に表示されます。">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!idDirty) setId(slugify(e.target.value));
              }}
              placeholder="マイフォトリアル風"
              autoFocus
            />
          </Field>
          <Field
            label="ID"
            hint="小文字英字・数字・ハイフンのみ。後から変更できないため、このエンジンでレンダリングした全テイクに記録されます。"
          >
            <Input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setIdDirty(true);
              }}
              placeholder="my-photoreal-look"
            />
          </Field>
          <Field label="説明（任意）">
            <TextArea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="このルックについて 1〜2 文で説明してください。"
            />
          </Field>
          {!idOk && id !== "" && (
            <p className="text-xs text-status-failed">
              ID は小文字のスラッグ形式にしてください（例: "my-photoreal-look"）。
            </p>
          )}
          {!idOk && id === "" && name.trim() !== "" && (
            <p className="text-xs text-status-failed">
              名前から ID を自動生成できませんでした。半角英小文字・数字・ハイフンで ID を入力してください。
            </p>
          )}
          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep("map")}>
              戻る
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim() || !idOk}
              busy={create.isPending}
              onClick={() => create.mutate()}
            >
              <Upload size={14} /> エンジンを作成
            </Button>
          </div>
        </div>
      )}

      {step === "done" && created && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-status-approved" />
            <span className="flex-1 text-sm font-medium text-paper">
              {created.name} をインストールしました
            </span>
            {created.available ? (
              <Badge tone="green">利用可能</Badge>
            ) : created.error ? (
              <Badge tone="amber">エンジン オフライン</Badge>
            ) : created.missing_models.length > 0 ? (
              <Badge tone="red">モデル不足</Badge>
            ) : (
              <Badge tone="red">ノード不足</Badge>
            )}
          </div>
          {created.available ? (
            <p className="text-sm text-fog">
              必要なものがすべて揃っています。すぐにレンダリングできます。
            </p>
          ) : created.error ? (
            <p className="text-sm text-fog">
              レンダリングエンジンに接続できなかったため、利用可否は未確認です。エンジンが起動した次回に確認されます。
            </p>
          ) : (
            <div>
              {created.missing_models.length > 0 && (
                <>
                  <p className="mb-1.5 text-sm text-fog">
                    未インストールのモデルファイルが必要です:
                  </p>
                  <ul className="mb-2 space-y-1">
                    {created.missing_models.map((f) => (
                      <li key={f} className="font-mono text-xs text-status-failed/90">
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {created.missing_nodes.length > 0 && (
                <>
                  <p className="mb-1.5 text-sm text-fog">
                    レンダリングエンジンに存在しないノードを使用しています:
                  </p>
                  <ul className="mb-2 space-y-1">
                    {created.missing_nodes.map((n) => (
                      <li key={n} className="font-mono text-xs text-status-failed/90">
                        {n}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-xs text-fog">
                下のリストでこのエンジンの行を展開すると、ダウンロードリンクとフォルダーの案内を確認できます。他の不足ありエンジンと同じ手順です。
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-fog">
            このエンジンはエンジン一覧と、ショットドロワーのエンジンメニューにも表示されます。
          </p>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={onClose}>
              完了
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
