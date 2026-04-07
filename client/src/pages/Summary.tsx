import { useParams, useLocation } from "wouter";
import { Phone, RotateCcw, ChevronDown } from "lucide-react";
import { getAllSessions } from "@/lib/sessions";

export default function Summary() {
  const { runId } = useParams<{ runId: string }>();
  const [, navigate] = useLocation();
  const all = getAllSessions();
  const calls = all.filter(s => s.runId === runId).sort((a, b) => a.id - b.id);

  if (calls.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-3">No calls found for this run.</p>
          <button onClick={() => navigate("/")} className="bg-[#1565a7] text-white px-4 py-2 rounded text-sm">Start a New Run</button>
        </div>
      </div>
    );
  }

  // Aggregate stats
  const totalCalls = calls.length;
  const dispositions: Record<string, number> = {};
  let correctCount = 0;
  let gradedCount = 0;
  let totalExchanges = 0;
  let totalDurationSec = 0;

  for (const c of calls) {
    const sc = c.scorecardJson as any;
    const picked: string | undefined = sc?.quickResult;
    if (picked) {
      dispositions[picked] = (dispositions[picked] || 0) + 1;
      gradedCount += 1;
      if (sc.resultCorrect) correctCount += 1;
    }
    totalExchanges += Math.floor(c.transcript.length / 2);
    if (c.endedAt) {
      totalDurationSec += Math.round((new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000);
    }
  }

  const accuracy = gradedCount > 0 ? Math.round((correctCount / gradedCount) * 100) : 0;
  const formatDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  const firstStart = calls[0].startedAt;
  const lastEnd = calls[calls.length - 1].endedAt || new Date().toISOString();

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b bg-gray-50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-base">Call Run Summary</h1>
            <p className="text-xs text-gray-500">{new Date(firstStart).toLocaleString()} — {new Date(lastEnd).toLocaleTimeString()}</p>
          </div>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 bg-[#1565a7] text-white px-3 py-1.5 rounded-lg text-sm">
            <RotateCcw className="w-3.5 h-3.5" /> New Run
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Aggregate stats */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Run Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-[#1565a7]">{totalCalls}</p>
              <p className="text-xs text-gray-500 mt-1">Calls Stacked</p>
            </div>
            <div className="border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{totalExchanges}</p>
              <p className="text-xs text-gray-500 mt-1">Total Exchanges</p>
            </div>
            <div className="border rounded-xl p-4 text-center">
              <p className="text-3xl font-bold">{formatDur(totalDurationSec)}</p>
              <p className="text-xs text-gray-500 mt-1">Time on Calls</p>
            </div>
            <div className="border rounded-xl p-4 text-center">
              <p className={`text-3xl font-bold ${accuracy >= 75 ? "text-green-600" : accuracy >= 50 ? "text-yellow-600" : "text-red-600"}`}>{accuracy}%</p>
              <p className="text-xs text-gray-500 mt-1">Disposition Accuracy</p>
            </div>
          </div>
        </section>

        {/* Disposition breakdown */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Disposition Breakdown</h2>
          {Object.keys(dispositions).length === 0 ? (
            <p className="text-xs text-gray-400 italic">No dispositions logged yet.</p>
          ) : (
            <div className="border rounded-xl p-4 space-y-2">
              {Object.entries(dispositions).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                const pct = Math.round((v / totalCalls) * 100);
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-16">{k}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-[#1565a7] h-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 w-16 text-right">{v} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-2 pt-4">
          <ChevronDown className="w-3.5 h-3.5" /> Scroll for individual call history <ChevronDown className="w-3.5 h-3.5" />
        </div>

        {/* Per-call history */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Individual Call History</h2>
          <div className="space-y-3">
            {calls.map((c, idx) => {
              const cfg = c.callConfig;
              const sc = c.scorecardJson as any;
              const picked = sc?.quickResult || "—";
              const suggested = sc?.suggestedResult || "—";
              const correct = !!sc?.resultCorrect;
              const dur = c.endedAt ? Math.round((new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 1000) : 0;
              const exchanges = Math.floor(c.transcript.length / 2);
              return (
                <div key={c.id} className="border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#1565a7] text-white flex items-center justify-center font-semibold flex-shrink-0">
                        {(cfg?.displayName || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">Call #{idx + 1} — {cfg?.displayName || "Unknown"}</p>
                        <p className="text-xs text-gray-500 truncate">{cfg?.jobFullTitle} · {cfg?.company}</p>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{cfg?.scenarioLabel}</span>
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{exchanges} exchanges</span>
                          <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{formatDur(dur)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] uppercase text-gray-400 tracking-wide">Disposition</p>
                      <p className="text-sm font-bold">{picked}</p>
                      {sc && (
                        <p className={`text-[10px] mt-0.5 font-semibold ${correct ? "text-green-600" : "text-amber-600"}`}>
                          {correct ? "Correct" : `Suggested: ${suggested}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {c.transcript.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-blue-600 cursor-pointer hover:underline">View transcript</summary>
                      <div className="mt-2 space-y-2 max-h-64 overflow-y-auto border-t pt-2">
                        {c.transcript.map((m, i) => (
                          <div key={i} className={`flex gap-2 ${m.role === "rep" ? "flex-row-reverse" : ""}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${m.role === "rep" ? "bg-[#1565a7] text-white" : "bg-gray-200"}`}>
                              {m.role === "rep" ? "R" : (cfg?.displayName || "?")[0]}
                            </div>
                            <div className={`max-w-[75%] rounded px-2.5 py-1.5 text-xs ${m.role === "rep" ? "bg-blue-50" : "bg-gray-100"}`}>
                              {m.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex justify-center gap-3 pb-12 pt-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 bg-[#1565a7] text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Phone className="w-4 h-4" /> Start a New Run
          </button>
        </div>
      </div>
    </div>
  );
}
