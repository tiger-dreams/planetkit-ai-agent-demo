import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";

interface MediaStatsPanelProps {
  conference: any;
  enabled: boolean;
}

type RtpEntry = Record<string, unknown>;

interface StatsSnapshot {
  timestamp: number;
  outboundAudio: RtpEntry[];
  outboundVideo: RtpEntry[];
  inboundAudio: RtpEntry[];
  inboundVideo: RtpEntry[];
}

const splitByKind = (entries: RtpEntry[] | undefined) => {
  const audio: RtpEntry[] = [];
  const video: RtpEntry[] = [];
  (entries ?? []).forEach((e) => {
    if (e?.kind === "audio") audio.push(e);
    else if (e?.kind === "video") video.push(e);
  });
  return { audio, video };
};

const renderEntry = (entry: RtpEntry, idx: number) => (
  <div
    key={`${entry.ssrc ?? idx}`}
    className="border border-white/10 rounded p-2 mb-1 bg-black/30"
  >
    {Object.entries(entry).map(([k, v]) => (
      <div key={k} className="flex justify-between gap-4 font-mono text-[10px]">
        <span className="text-white/60">{k}</span>
        <span className="text-white">{String(v)}</span>
      </div>
    ))}
  </div>
);

export const MediaStatsPanel = ({ conference, enabled }: MediaStatsPanelProps) => {
  const [snapshot, setSnapshot] = useState<StatsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !conference) return;
    let cancelled = false;

    const tick = () => {
      if (typeof conference.getCurrentStats !== "function") {
        setError("getCurrentStats API not available on this SDK build");
        return;
      }
      // SDK 내부 버그 방어: session 없을 때 wtpGetStats가 `new Promise.reject(...)`
      // (잘못된 SDK 코드)로 동기 throw. 또한 반환값이 thenable이 아닐 가능성도 처리.
      let result: unknown;
      try {
        result = conference.getCurrentStats();
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
        return;
      }
      const isThenable =
        result && typeof (result as { then?: unknown }).then === "function";
      if (!isThenable) {
        if (!cancelled) setError("stats unavailable (no active session yet)");
        return;
      }
      Promise.resolve(result as Promise<any>)
        .then((stats) => {
          if (cancelled) return;
          const out = splitByKind(stats?.["outbound-rtp"]);
          const inn = splitByKind(stats?.["inbound-rtp"]);
          setSnapshot({
            timestamp: stats?.timestamp ?? Date.now(),
            outboundAudio: out.audio,
            outboundVideo: out.video,
            inboundAudio: inn.audio,
            inboundVideo: inn.video,
          });
          setError(null);
        })
        .catch((e: any) => {
          if (!cancelled) setError(e?.message ?? String(e));
        });
    };

    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [conference, enabled]);

  if (!enabled) return null;

  return (
    <div className="absolute top-[60px] right-2 w-[320px] max-h-[calc(100vh-180px)] overflow-y-auto z-30 bg-black/85 backdrop-blur-sm border border-white/15 rounded-lg p-3 text-white text-xs">
      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-black/85 -mx-3 px-3 py-1 border-b border-white/10">
        <BarChart3 className="w-4 h-4" />
        <span className="font-semibold">Media Statistics</span>
        {snapshot && (
          <span className="ml-auto text-[10px] text-white/50 font-mono">
            {new Date(snapshot.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <div className="text-red-400 text-[11px] mb-2">⚠ {error}</div>}

      {snapshot && (
        <>
          <Section title="Outbound · audio" entries={snapshot.outboundAudio} />
          <Section title="Outbound · video" entries={snapshot.outboundVideo} />
          <Section title="Inbound · audio" entries={snapshot.inboundAudio} />
          <Section title="Inbound · video" entries={snapshot.inboundVideo} />
        </>
      )}
      {!snapshot && !error && <div className="text-white/50">Collecting…</div>}
    </div>
  );
};

const Section = ({ title, entries }: { title: string; entries: RtpEntry[] }) => (
  <div className="mb-2">
    <div className="text-[11px] font-semibold text-white/70 mb-1">
      {title} ({entries.length})
    </div>
    {entries.length === 0 ? (
      <div className="text-white/40 text-[10px] italic">no streams</div>
    ) : (
      entries.map(renderEntry)
    )}
  </div>
);
