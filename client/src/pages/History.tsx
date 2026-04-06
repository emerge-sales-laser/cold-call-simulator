import { useLocation } from "wouter";
import { Phone, Clock, ChevronRight } from "lucide-react";
import { getAllSessions } from "@/lib/sessions";
import { PERSONAS, PRODUCTS } from "@/lib/personas";

export default function History() {
  const [, navigate] = useLocation();
  const sessions = getAllSessions();
  const completed = sessions.filter(s => s.status === "completed");
  const avgScore = completed.length
    ? Math.round(completed.map(s => s.scorecardJson?.overallScore || 0).reduce((a, b) => a + b, 0) / completed.length)
    : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1565a7] flex items-center justify-center"><Clock className="w-5 h-5 text-white" /></div>
            <div><h1 className="font-semibold text-sm">Call History</h1><p className="text-xs text-gray-500">{completed.length} completed</p></div>
          </div>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm bg-[#1565a7] text-white px-3 py-1.5 rounded-lg"><Phone className="w-3.5 h-3.5" /> New Call</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {completed.length > 0 && avgScore !== null && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border rounded-xl p-4 text-center"><p className="text-2xl font-bold text-[#1565a7]">{avgScore}</p><p className="text-xs text-gray-500 mt-1">Avg Score</p></div>
            <div className="border rounded-xl p-4 text-center"><p className="text-2xl font-bold">{completed.length}</p><p className="text-xs text-gray-500 mt-1">Calls</p></div>
            <div className="border rounded-xl p-4 text-center"><p className="text-2xl font-bold">{avgScore >= 75 ? "🏆" : avgScore >= 55 ? "📈" : "⚠️"}</p><p className="text-xs text-gray-500 mt-1">Grade</p></div>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-16">
            <Phone className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium">No calls yet</p>
            <p className="text-xs text-gray-500 mt-1 mb-4">Start your first simulation</p>
            <button onClick={() => navigate("/")} className="bg-[#1565a7] text-white px-4 py-2 rounded-lg text-sm">Start First Call</button>
          </div>
        ) : (
          <div className="space-y-3">
            {[...sessions].reverse().map(s => {
              const persona = PERSONAS[s.personaId];
              const score = s.scorecardJson?.overallScore;
              const scoreColor = !score ? "text-gray-400" : score >= 75 ? "text-green-600" : score >= 55 ? "text-yellow-600" : "text-red-600";
              return (
                <div key={s.id} className="border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => s.status === "completed" ? navigate(`/scorecard/${s.id}`) : navigate(`/call/${s.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{persona?.avatar}</div>
                      <div>
                        <p className="text-sm font-medium">{persona?.displayName}</p>
                        <p className="text-xs text-gray-500">{persona?.company}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{s.status === "completed" ? "Completed" : "In Progress"}</span>
                          <span className="text-xs text-gray-500">{new Date(s.startedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {score && <div className="text-right"><p className={`text-xl font-bold ${scoreColor}`}>{score}</p><p className="text-xs text-gray-500">/ 100</p></div>}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
