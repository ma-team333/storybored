import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clapperboard, Download, Film, Play } from "lucide-react";
import { apiGet, apiPost, mediaUrl } from "../lib/api";
import type { BoardProject, ExportEntry, Job, Shot } from "../lib/types";
import { activeVideoJob, formatDuration, shotLabel, videoTake } from "../lib/format";
import { Badge, Button, ProgressBar, Spinner } from "../components/ui";
import { EmptyState, ErrorState, Skeleton } from "../components/EmptyState";
import { useToast } from "../lib/toast";

function exportPath(e: ExportEntry | string): string | undefined {
  if (typeof e === "string") return e;
  return e.file_path ?? e.path;
}

export function ExportPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [animaticJobId, setAnimaticJobId] = useState<number | null>(null);
  const [titleCards, setTitleCards] = useState(true);
  const [animaticScene, setAnimaticScene] = useState<number | "all">("all");

  const { data, isLoading, isError, refetch } = useQuery<BoardProject>({
    queryKey: ["project", projectId],
    queryFn: () => apiGet<BoardProject>(`/api/projects/${projectId}`),
    enabled: Number.isFinite(projectId),
  });

  const { data: exports } = useQuery<(ExportEntry | string)[]>({
    queryKey: ["exports", projectId],
    queryFn: () => apiGet<(ExportEntry | string)[]>(`/api/projects/${projectId}/exports`),
    enabled: Number.isFinite(projectId),
    retry: 1,
  });

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["jobs"],
    queryFn: () => apiGet<Job[]>("/api/jobs"),
    retry: 1,
  });
  const animaticJob = useMemo(
    () =>
      animaticJobId != null
        ? (jobs ?? []).find((j) => j.id === animaticJobId) ?? null
        : null,
    [jobs, animaticJobId],
  );

  const approvedShots = useMemo(() => {
    const out: { shot: Shot; label: string }[] = [];
    (data?.scenes ?? []).forEach((scene, i) => {
      (scene.shots ?? []).forEach((shot, j) => {
        if (shot.status === "approved") out.push({ shot, label: shotLabel(i, j) });
      });
    });
    return out;
  }, [data]);

  const renderOne = useMutation({
    mutationFn: (shotId: number) => apiPost(`/api/shots/${shotId}/render-video`, {}),
    onSuccess: () => {
      toast("動画レンダリングをキューに追加しました。", "success");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const renderAll = useMutation({
    mutationFn: () => apiPost(`/api/projects/${projectId}/render-videos`, {}),
    onSuccess: () => {
      toast("承認済みの全ショットの動画をキューに追加しました。", "success");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const exportAnimatic = useMutation({
    mutationFn: () =>
      apiPost<{ job_id: number }>(`/api/projects/${projectId}/animatic`, {
        title_cards: titleCards,
        scene_id: animaticScene === "all" ? undefined : animaticScene,
      }),
    onSuccess: (r) => {
      setAnimaticJobId(r.job_id);
      toast("アニマティックを生成中…", "success");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  if (isError || !data)
    return <ErrorState body="このプロジェクトを読み込めませんでした。" onRetry={() => refetch()} />;

  // The backend already returns exports newest-first; sort by created_at desc
  // when present so we always play/download the latest cut, not the oldest.
  const latestExport = [...(exports ?? [])]
    .sort((a, b) => {
      const ta = typeof a === "string" ? "" : a.created_at ?? "";
      const tb = typeof b === "string" ? "" : b.created_at ?? "";
      return tb.localeCompare(ta);
    })
    .map(exportPath)
    .filter((p): p is string => !!p)[0];
  const latestUrl = mediaUrl(latestExport);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to={`/p/${projectId}`}
          className="rounded-md p-1.5 text-fog hover:text-paper"
          title="ボードに戻る"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">書き出し</h1>
          <p className="text-xs text-fog">{data.title}</p>
        </div>
      </div>

      {approvedShots.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="まだ承認済みのショットがありません"
          body="ボードでショットを承認してください(スチルを生成してお気に入りのテイクを選び、「承認」を押す)。承認したショットがここに並び、最終カットを作れます。"
          action={
            <Link to={`/p/${projectId}`}>
              <Button variant="primary">ボードに戻る</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* approved shots checklist */}
          <section className="overflow-hidden rounded-xl border border-line bg-ink-900/40">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">
                承認済みショット{" "}
                <span className="font-normal text-fog">({approvedShots.length})</span>
              </h2>
              <Button size="sm" onClick={() => renderAll.mutate()} busy={renderAll.isPending}>
                <Film size={13} /> 全動画をレンダリング
              </Button>
            </header>
            <ul>
              {approvedShots.map(({ shot, label }) => {
                const v = videoTake(shot);
                // A video_gen job may be queued/running before its take row
                // exists — treat that as "rendering" so we don't re-queue it.
                const jobActive = !!activeVideoJob(jobs, shot.id);
                const rendering = v?.status === "pending" || jobActive;
                const busyThis =
                  renderOne.isPending && renderOne.variables === shot.id;
                return (
                  <li
                    key={shot.id}
                    className="flex items-center gap-3 border-b border-line/50 px-4 py-2.5 last:border-b-0"
                  >
                    <span className="w-10 text-sm font-semibold text-paper">{label}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-mist">
                      {shot.description || "無題のショット"}
                    </span>
                    <span className="text-xs text-fog">{formatDuration(shot.duration_s)}</span>
                    {v?.status === "done" ? (
                      <Badge tone="green">
                        <Check size={10} /> 動画あり
                      </Badge>
                    ) : rendering ? (
                      <Badge tone="amber" pulse>
                        レンダリング中
                      </Badge>
                    ) : v?.status === "failed" ? (
                      <Badge tone="red">失敗</Badge>
                    ) : (
                      <Badge tone="fog">スチルのみ</Badge>
                    )}
                    {v?.status !== "done" && (
                      <Button
                        size="sm"
                        onClick={() => renderOne.mutate(shot.id)}
                        disabled={rendering || busyThis}
                      >
                        <Play size={12} /> {rendering ? "レンダリング中…" : "レンダリング"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* animatic */}
          <section className="rounded-xl border border-line bg-ink-900/40 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">アニマティック</h2>
                <p className="mt-1 text-xs leading-relaxed text-fog">
                  ボードを順番につなげた 1 本の MP4 — 動画が完成しているショットは動画を、
                  そうでないショットはスチルで繋ぎます。全体または単一シーンで書き出せます。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <select
                    value={animaticScene === "all" ? "all" : String(animaticScene)}
                    onChange={(e) =>
                      setAnimaticScene(e.target.value === "all" ? "all" : Number(e.target.value))
                    }
                    className="h-8 rounded-md border border-line bg-ink-900 px-2 text-xs text-mist"
                  >
                    <option value="all">ボード全体</option>
                    {(data.scenes ?? []).map((scene, i) => (
                      <option key={scene.id} value={scene.id}>
                        シーン {i + 1}: {scene.title || scene.slugline || "無題"}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-fog">
                    <input
                      type="checkbox"
                      checked={titleCards}
                      onChange={(e) => setTitleCards(e.target.checked)}
                      className="h-4 w-4 accent-[#f0b429]"
                    />
                    シーンのタイトルカードを追加
                  </label>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => exportAnimatic.mutate()}
                busy={
                  exportAnimatic.isPending ||
                  animaticJob?.status === "running" ||
                  animaticJob?.status === "queued"
                }
              >
                <Clapperboard size={14} /> アニマティックを書き出し
              </Button>
            </div>

            {animaticJob && (animaticJob.status === "running" || animaticJob.status === "queued") && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-fog">
                  <Spinner size={13} />
                  {animaticJob.detail || "クリップを組み立て中…"}
                </div>
                <ProgressBar value={animaticJob.progress} />
              </div>
            )}
            {animaticJob?.status === "failed" && (
              <p className="mt-4 rounded-md border border-status-failed/30 bg-status-failed/10 p-3 text-xs text-status-failed">
                書き出しに失敗しました: {animaticJob.error ?? "不明なエラー"}
              </p>
            )}

            {latestUrl && (
              <div className="mt-5 space-y-3">
                <video src={latestUrl} controls className="w-full rounded-lg border border-line" />
                <a
                  href={latestUrl}
                  download
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-line-bright px-3.5 text-sm font-medium text-mist hover:text-paper"
                >
                  <Download size={14} /> MP4 をダウンロード
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
