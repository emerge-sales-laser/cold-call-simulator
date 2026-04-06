import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, Phone, Trophy, TrendingUp, AlertCircle, ChevronRight, RotateCcw, Star } from "lucide-react";
import { getSession } from "@/lib/sessions";
import { PERSONAS, PRODUCTS } from "@/lib/personas";

export default function Scorecard() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [showTranscript, setShowTranscript] = useState(false);

  const session = getSession(Number(id));
  if (!session || !session.scorecardJson) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Scorecard not found</p></div>;
  }

  const scorecard = session.scorecardJson;
  const transcript = session.transcript;
  const persona = PERSONAS[session.personaId];
  const product = PRODUCTS[session.productId];
  const callDuration = session.endedAt ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000) : 0;
  const formatDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
  const verdictIcon = scorecard.verdict?.includes("Strong") ? "🏆" : scorecard.verdict?.includes("Developing") ? "📈" : "⚠️";

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1565a7] flex items-center justify-center"><Trophy className="w-5 h-5 text-white" /></div>
            <div><h1 className="font-semibold text-sm">Call Scorecard</h1><p className="text-xs text-gray-500">{session.repName} calling {persona.displayName}</p></div>
          </div>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"><RotateCcw className="w-3.5 h-3.5" /> New Call</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="border-2 border-[#1565a7]/20 rounded-xl p-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${scorecard.overallScore >= 75 ? "bg-green-500/10 border-green-500/30" : scorecard.overallScore >= 55 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30"}`}>
              <div className="text-center"><p className={`text-2xl font-bold ${scorecard.overallScore >= 75 ? "text-green-500" : scorecard.overallScore >= 55 ? "text-yellow-500" : "text-red-500"}`}>{scorecard.overallScore}</p><p className="text-xs text-gray-500">/ 100</p></div>
            </div>
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-2"><span className="text-xl">{verdictIcon}</span><h2 className="text-xl font-bold">{scorecard.verdict}</h2></div>
              <p className="text-sm text-gray-500 leading-relaxed mb-4 max-w-xl">{scorecard.coachingSummary}</p>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start text-xs text-gray-500">
                <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1"><span>{persona.avatar}</span><span>{persona.title}</span></div>
                <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1"><span>⏱</span><span>{formatDur(callDuration)}</span></div>
                <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1"><span>💬</span><span>{Math.floor(transcript.length / 2)} exchanges</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-green-200 rounded-xl p-4">
            <h3 className="text-base font-semibold flex items-center gap-2 text-green-700 mb-3"><TrendingUp className="w-4 h-4" /> Strengths</h3>
            <div className="space-y-3">{scorecard.strengths?.map((s: string, i: number) => <div key={i} className="flex gap-2"><Star className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-500">{s}</p></div>)}</div>
          </div>
          <div className="border border-orange-200 rounded-xl p-4">
            <h3 className="text-base font-semibold flex items-center gap-2 text-orange-700 mb-3"><AlertCircle className="w-4 h-4" /> Areas to Develop</h3>
            <div className="space-y-3">{scorecard.improvements?.map((s: string, i: number) => <div key={i} className="flex gap-2"><ChevronRight className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-500">{s}</p></div>)}</div>
          </div>
        </div>

        <div className="border rounded-xl p-6">
          <h3 className="text-base font-semibold mb-4">Skill Breakdown</h3>
          <div className="space-y-6">
            {scorecard.dimensions?.map((dim: any, i: number) => {
              const color = dim.score >= 8 ? "bg-green-500" : dim.score >= 6 ? "bg-yellow-500" : dim.score >= 4 ? "bg-orange-500" : "bg-red-500";
              return (<div key={i} className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{dim.name}</span><span className="text-sm font-bold">{dim.score}/10</span></div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${dim.score * 10}%` }} /></div>
                <p className="text-xs text-gray-500">{dim.feedback}</p>
              </div>);
            })}
          </div>
        </div>

        <div className="border rounded-xl">
          <div className="px-6 py-3 cursor-pointer flex items-center justify-between" onClick={() => setShowTranscript(!showTranscript)}>
            <h3 className="text-base font-semibold">Full Call Transcript</h3>
            <button className="text-xs text-gray-500">{showTranscript ? "Hide" : "Show"}</button>
          </div>
          {showTranscript && <div className="px-6 pb-4 space-y-3">{transcript.map((msg, idx) => (
            <div key={idx} className={`flex gap-2 ${msg.role === "rep" ? "flex-row-reverse" : ""}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${msg.role === "rep" ? "bg-[#1565a7] text-white" : "bg-gray-200"}`}>{msg.role === "rep" ? "R" : persona.avatar}</div>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.role === "rep" ? "bg-blue-50" : "bg-gray-100"}`}>{msg.content}</div>
            </div>
          ))}</div>}
        </div>

        <div className="flex justify-center gap-3 pb-8">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 bg-[#1565a7] text-white px-4 py-2 rounded-lg text-sm font-medium"><Phone className="w-4 h-4" /> Practice Another Call</button>
          <button onClick={() => navigate("/history")} className="flex items-center gap-2 border border-gray-300 px-4 py-2 rounded-lg text-sm">View History</button>
        </div>
      </div>
    </div>
  );
}
