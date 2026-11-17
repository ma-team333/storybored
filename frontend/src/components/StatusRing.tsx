import type { ShotStatus } from "../lib/types";

const COLORS: Record<ShotStatus, string> = {
  draft: "var(--color-status-draft)",
  queued: "var(--color-status-queued)",
  generated: "var(--color-status-generated)",
  approved: "var(--color-status-approved)",
};

const LABELS: Record<ShotStatus, string> = {
  draft: "下書き",
  queued: "待機中",
  generated: "スチル生成済み",
  approved: "承認済み",
};

export function StatusRing({ status }: { status: ShotStatus }) {
  return (
    <span
      title={LABELS[status]}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        status === "queued" ? "sb-pulse" : ""
      }`}
      style={{
        border: `2px solid ${COLORS[status]}`,
        backgroundColor:
          status === "approved" ? COLORS[status] : "transparent",
      }}
    />
  );
}

export function statusLabel(status: ShotStatus): string {
  return LABELS[status];
}
