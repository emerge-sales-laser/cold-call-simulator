import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, PhoneOff, Send, AlertTriangle, Mic, MicOff, Phone, Volume2 } from "lucide-react";
import { PERSONAS, PRODUCTS, DEFAULT_PRODUCT_ID } from "@/lib/personas";
import { buildPersonaSystemPrompt } from "@/lib/prompts";
import { groqChat, groqWhisper } from "@/lib/groq-client";
import { createSession, getSession, updateSession, addMessageToSession, type Session } from "@/lib/sessions";

// ── Types ────────────────────────────────────────────────────────────────────
interface Message { role: "rep" | "prospect"; content: string; }
interface ExchangeGrade { exchange: number; repText: string; prospectText: string; grade: "A"|"B"|"C"|"D"|"F"; note: string; }
interface Persona { id: string; title: string; displayName: string; company: string; companyDescription: string; department: string; avatar: string; decisionRole: string; topConcerns: string[]; }

function gradeExchange(repText: string, prospectText: string): { grade: ExchangeGrade["grade"]; note: string } {
  const rep = repText.toLowerCase(); const prospect = prospectText.toLowerCase();
  let score = 5;
  if (/\?/.test(repText)) score += 1; if (/you|your/.test(rep)) score += 0.5;
  if (/pipeline|revenue|quota|appointments|reps|territory|coverage/.test(rep)) score += 1;
  if (/understand|appreciate|fair|good point|makes sense/.test(rep)) score += 1;
  if (rep.length < 40) score -= 2; if (/best.in.class|industry.leading|synerg|solution/.test(rep)) score -= 1.5;
  if (/interesting|tell me|how|what|when|who|yes|sure|okay/.test(prospect)) score += 1;
  if (/not interested|busy|send.*email|call.*back|no thanks|freeze/.test(prospect)) score -= 1;
  if (/send|proposal|call|schedule|tuesday|thursday|next week|meet/.test(prospect)) score += 2;
  if (score >= 9) return { grade: "A", note: "Strong exchange — prospect engaged" };
  if (score >= 7.5) return { grade: "B", note: "Good — kept momentum" };
  if (score >= 6) return { grade: "C", note: "Average exchange" };
  if (score >= 4.5) return { grade: "D", note: "Needs more discovery" };
  return { grade: "F", note: "Missed the mark — review technique" };
}

const GRADE_COLORS: Record<string, string> = { A: "bg-green-600 text-white", B: "bg-blue-600 text-white", C: "bg-yellow-500 text-black", D: "bg-orange-500 text-white", F: "bg-red-600 text-white" };
const RESULT_BUTTONS = ["NO", "NC", "NA-HOT", "LM", "CCC", "EMAIL", "WW", "DNC"];
const RESULT_COLORS: Record<string, string> = { "NO": "bg-red-600 hover:bg-red-700", "NC": "bg-gray-500 hover:bg-gray-600", "NA-HOT": "bg-orange-500 hover:bg-orange-600", "LM": "bg-blue-600 hover:bg-blue-700", "CCC": "bg-purple-600 hover:bg-purple-700", "EMAIL": "bg-teal-600 hover:bg-teal-700", "WW": "bg-yellow-600 hover:bg-yellow-700", "DNC": "bg-gray-800 hover:bg-gray-900" };
const FEMALE_PERSONAS = new Set(["ceo_luminarx", "vp_sales_clearvision"]);

// ── Intro Popup ──────────────────────────────────────────────────────────────
function IntroPopup({ onStart }: { onStart: (apiKey: string, repName: string, personaId: string) => void }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
  const [repName, setRepName] = useState(() => localStorage.getItem("rep_name") || "");
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [error, setError] = useState("");

  const allPersonas = Object.values(PERSONAS).map(p => ({ id: p.id, title: p.title, displayName: p.displayName, company: p.company, companyDescription: p.companyDescription, department: p.department, avatar: p.avatar, decisionRole: p.decisionRole, topConcerns: p.topConcerns }));
  const ceos = allPersonas.filter(p => p.title === "Chief Executive Officer");
  const vps = allPersonas.filter(p => p.title === "VP of Sales");

  const handleStart = () => {
    if (!apiKey.trim()) { setError("Groq API key is required. Get one free at console.groq.com/keys"); return; }
    if (!repName.trim()) { setError("Your name is required"); return; }
    if (!selectedPersona) { setError("Select a prospect to call"); return; }
    localStorage.setItem("groq_api_key", apiKey.trim());
    localStorage.setItem("rep_name", repName.trim());
    onStart(apiKey.trim(), repName.trim(), selectedPersona);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-[#1565a7] text-white px-6 py-4 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center"><Phone className="w-5 h-5" /></div>
            <div><h1 className="font-bold text-lg">MedDevice Cold Call Simulator</h1><p className="text-blue-200 text-xs">by Emerge — Voice-Powered AI Training</p></div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Groq API Key</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="gsk_..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1565a7]" />
            <p className="text-xs text-gray-400 mt-1">Free — no credit card needed. Get yours at <a href="https://console.groq.com/keys" target="_blank" rel="noopener" className="text-blue-600 underline">console.groq.com/keys</a></p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Your Name</label>
            <input type="text" value={repName} onChange={(e) => setRepName(e.target.value)} placeholder="e.g. Sarah Mitchell"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1565a7]" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 block mb-2">Who are you calling?</label>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Chief Executive Officers</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {ceos.map(p => (
                <button key={p.id} onClick={() => setSelectedPersona(p.id)} className={`text-left p-2.5 rounded-lg border-2 transition-all text-xs ${selectedPersona === p.id ? "border-[#1565a7] bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center gap-2 mb-1"><span className="text-lg">{p.avatar}</span><div><div className="font-semibold text-gray-900">{p.displayName}</div><div className="text-gray-500 text-[10px]">{p.title}</div></div></div>
                  <div className="text-[10px] text-blue-600 font-medium">{p.company}</div><div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{p.companyDescription}</div>
                </button>))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">VP of Sales</p>
            <div className="grid grid-cols-3 gap-2">
              {vps.map(p => (
                <button key={p.id} onClick={() => setSelectedPersona(p.id)} className={`text-left p-2.5 rounded-lg border-2 transition-all text-xs ${selectedPersona === p.id ? "border-[#1565a7] bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="flex items-center gap-2 mb-1"><span className="text-lg">{p.avatar}</span><div><div className="font-semibold text-gray-900">{p.displayName}</div><div className="text-gray-500 text-[10px]">{p.title}</div></div></div>
                  <div className="text-[10px] text-blue-600 font-medium">{p.company}</div><div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{p.companyDescription}</div>
                </button>))}
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Voice Call Tips</p>
            <ul className="text-xs text-amber-700 space-y-0.5">
              <li>- Voice is always on — just start speaking naturally</li>
              <li>- Ask questions before pitching. Earn the right to present.</li>
              <li>- The AI prospect will respond with voice automatically</li>
              <li>- Click "End Call" when done to get your AI scorecard</li>
            </ul>
          </div>
          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          <button onClick={handleStart} className="w-full bg-[#1565a7] hover:bg-[#1255a0] text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"><Phone className="w-4 h-4" /> Start Voice Call</button>
        </div>
      </div>
    </div>
  );
}

// ── Web Speech TTS (gender-aware) ────────────────────────────────────────────
function speakText(text: string, personaId?: string, onStart?: () => void, onEnd?: () => void) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  const isFemale = personaId ? FEMALE_PERSONAS.has(personaId) : false;
  const voices = window.speechSynthesis.getVoices();
  let voice: SpeechSynthesisVoice | undefined;
  if (isFemale) {
    voice = voices.find(v => v.name.includes("Google US English Female")) || voices.find(v => v.name.includes("Microsoft Zira")) || voices.find(v => v.name.includes("Samantha")) || voices.find(v => v.name.toLowerCase().includes("female") && v.lang.startsWith("en"));
    utterance.pitch = 1.15;
  } else {
    voice = voices.find(v => v.name.includes("Google US English Male")) || voices.find(v => v.name.includes("Microsoft David")) || voices.find(v => v.name.includes("Daniel")) || voices.find(v => v.name.toLowerCase().includes("male") && v.lang.startsWith("en"));
    utterance.pitch = 0.9;
  }
  if (!voice) voice = voices.find(v => v.lang.startsWith("en-US") && !v.localService) || voices.find(v => v.lang.startsWith("en"));
  if (voice) utterance.voice = voice;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

if (typeof window !== "undefined") {
  if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }
  window.addEventListener("beforeunload", () => { window.speechSynthesis?.cancel(); });
}

// ── Whisper-powered STT ──────────────────────────────────────────────────────
function useAlwaysOnSTT(onFinalResult: (text: string) => void, enabled: boolean, apiKey: string) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const enabledRef = useRef(enabled); const pausedRef = useRef(false);
  const onFinalResultRef = useRef(onFinalResult); const apiKeyRef = useRef(apiKey);
  const recognitionRef = useRef<any>(null); const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null); const chunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false); const hasSpeechRef = useRef(false);
  onFinalResultRef.current = onFinalResult; enabledRef.current = enabled; apiKeyRef.current = apiKey;

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) return null;
    setIsTranscribing(true); setInterimText("Transcribing...");
    try {
      const text = await groqWhisper(apiKeyRef.current, audioBlob);
      setIsTranscribing(false); setInterimText("");
      return text || null;
    } catch (err: any) { console.error("[STT] Whisper error:", err); setIsTranscribing(false); setInterimText(""); return null; }
  }, []);

  const startRecording = useCallback(() => {
    if (!mediaRecorderRef.current || isRecordingRef.current) return;
    chunksRef.current = []; hasSpeechRef.current = false;
    try { mediaRecorderRef.current.start(); isRecordingRef.current = true; } catch {}
  }, []);

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecordingRef.current) return;
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        isRecordingRef.current = false;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" }); chunksRef.current = [];
        if (blob.size > 1000) { const text = await transcribeAudio(blob); if (text) onFinalResultRef.current(text); }
        resolve();
      };
      mediaRecorderRef.current!.stop();
    });
  }, [transcribeAudio]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    if (recognitionRef.current?._running) { try { recognitionRef.current.stop(); } catch {} }
    if (isRecordingRef.current && mediaRecorderRef.current) { try { mediaRecorderRef.current.stop(); } catch {} isRecordingRef.current = false; }
    setIsListening(false); setInterimText("");
  }, []);

  const startListeningCycle = useCallback(() => {
    if (!recognitionRef.current || pausedRef.current || !enabledRef.current) return;
    startRecording();
    try { recognitionRef.current.start(); recognitionRef.current._running = true; setIsListening(true); } catch {}
  }, [startRecording]);

  const resume = useCallback(() => {
    pausedRef.current = false; setInterimText("");
    setTimeout(() => startListeningCycle(), 300);
  }, [startListeningCycle]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mediaRecorderRef.current = recorder;

        const recognition = new SR();
        recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US"; recognition._running = false;
        recognition.onstart = () => { recognition._running = true; setIsListening(true); };
        recognition.onresult = (event: any) => {
          if (pausedRef.current) return;
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            interim += event.results[i][0].transcript;
            if (event.results[i].isFinal) hasSpeechRef.current = true;
          }
          if (interim) setInterimText(interim);
        };
        recognition.onend = async () => {
          recognition._running = false;
          if (pausedRef.current || !enabledRef.current) { setIsListening(false); return; }
          if (hasSpeechRef.current && isRecordingRef.current) {
            setIsListening(false);
            await stopRecordingAndTranscribe();
            if (enabledRef.current && !pausedRef.current) setTimeout(() => startListeningCycle(), 300);
          } else {
            if (isRecordingRef.current && mediaRecorderRef.current) { mediaRecorderRef.current.onstop = () => { isRecordingRef.current = false; }; try { mediaRecorderRef.current.stop(); } catch {} }
            if (enabledRef.current && !pausedRef.current) setTimeout(() => startListeningCycle(), 200);
          }
        };
        recognition.onerror = (event: any) => {
          if (event.error === "not-allowed") setError("Microphone denied. Click lock icon and allow mic.");
          else if (event.error !== "no-speech" && event.error !== "aborted") setError(`Speech error: ${event.error}`);
        };
        recognitionRef.current = recognition; setSupported(true); setError(null);
        startRecording();
        try { recognition.start(); recognition._running = true; setIsListening(true); } catch {}
      } catch (err: any) {
        setError(err.name === "NotAllowedError" ? "Microphone denied." : "Mic error: " + err.message);
        setSupported(false);
      }
    }
    init();
    return () => { cancelled = true; enabledRef.current = false; if (recognitionRef.current?._running) { try { recognitionRef.current.stop(); } catch {} } if (mediaRecorderRef.current?.state === "recording") { try { mediaRecorderRef.current.stop(); } catch {} } if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [enabled]);

  return { isListening: isListening && !isTranscribing, interimText, supported, error, pause, resume, isTranscribing };
}

// ── Main Call Component ──────────────────────────────────────────────────────
export default function Call() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [showIntro, setShowIntro] = useState(!id);
  const [sessionId, setSessionId] = useState<number | null>(id ? Number(id) : null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
  const [session, setSession] = useState<Session | null>(null);
  const [transcript, setTranscript] = useState<Message[]>([]);
  const [grades, setGrades] = useState<ExchangeGrade[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedResult, setSelectedResult] = useState(""); const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"Call Transcript"|"Demographics"|"Script"|"Qualifiers"|"Sales Info">("Call Transcript");
  const [endCallError, setEndCallError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [input, setInput] = useState("");
  const personaIdRef = useRef<string>("");

  // Load session
  useEffect(() => {
    if (sessionId) {
      const s = getSession(sessionId);
      if (s) {
        setSession(s);
        personaIdRef.current = s.personaId;
        if (s.transcript.length > 0 && transcript.length === 0) {
          setTranscript(s.transcript as Message[]);
          const rebuilt: ExchangeGrade[] = [];
          for (let i = 0; i < s.transcript.length - 1; i += 2) {
            if (s.transcript[i]?.role === "rep" && s.transcript[i + 1]?.role === "prospect") {
              const { grade, note } = gradeExchange(s.transcript[i].content, s.transcript[i + 1].content);
              rebuilt.push({ exchange: rebuilt.length + 1, repText: s.transcript[i].content, prospectText: s.transcript[i + 1].content, grade, note });
            }
          }
          setGrades(rebuilt);
        }
      }
    }
  }, [sessionId]);

  // Timer
  useEffect(() => {
    if (sessionId && !showIntro) {
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      setMicEnabled(true);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionId, showIntro]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcript, isThinking, isSpeaking]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const contactDate = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

  // Send to Groq directly from browser
  const sendToAI = useCallback(async (repText: string) => {
    if (!sessionId || !apiKey || isThinking) return;
    setIsThinking(true); setVoiceError(null); stt.pause();
    const newTranscript: Message[] = [...transcript, { role: "rep", content: repText }];
    setTranscript(newTranscript);
    addMessageToSession(sessionId, "rep", repText);

    try {
      const systemPrompt = buildPersonaSystemPrompt(personaIdRef.current, DEFAULT_PRODUCT_ID);
      const reply = await groqChat(apiKey, systemPrompt, newTranscript.slice(0, -1), repText);
      const fullTranscript: Message[] = [...newTranscript, { role: "prospect", content: reply }];
      setTranscript(fullTranscript);
      addMessageToSession(sessionId, "prospect", reply);
      setIsThinking(false);

      const repMsgs = fullTranscript.filter(m => m.role === "rep");
      const prospectMsgs = fullTranscript.filter(m => m.role === "prospect");
      const lastRep = repMsgs[repMsgs.length - 1]; const lastProspect = prospectMsgs[prospectMsgs.length - 1];
      if (lastRep && lastProspect) {
        const { grade, note } = gradeExchange(lastRep.content, lastProspect.content);
        setGrades(prev => [...prev, { exchange: prev.length + 1, repText: lastRep.content, prospectText: lastProspect.content, grade, note }]);
      }

      if (reply) {
        speakText(reply, personaIdRef.current, () => setIsSpeaking(true), () => { setIsSpeaking(false); stt.resume(); });
      } else { stt.resume(); }
    } catch (err: any) {
      setIsThinking(false); stt.resume();
      setVoiceError(err.message || String(err));
    }
  }, [sessionId, apiKey, transcript]);

  const stt = useAlwaysOnSTT((text) => sendToAI(text), micEnabled, apiKey);

  const handleSend = () => { const t = input.trim(); if (!t || isThinking) return; setInput(""); window.speechSynthesis?.cancel(); stt.pause(); sendToAI(t); };

  const handleIntroStart = (key: string, name: string, pId: string) => {
    setApiKey(key);
    const s = createSession(pId, DEFAULT_PRODUCT_ID, name);
    setSession(s); setSessionId(s.id); personaIdRef.current = pId;
    setShowIntro(false);
    window.location.hash = `/call/${s.id}`;
  };

  const handleEndCall = async () => {
    if (isEnding) return;
    setIsEnding(true); setEndCallError(null);
    window.speechSynthesis?.cancel(); setMicEnabled(false);
    try {
      const { buildScoringPrompt } = await import("@/lib/prompts");
      const { groqScorecard } = await import("@/lib/groq-client");
      const scoringPrompt = buildScoringPrompt(personaIdRef.current, DEFAULT_PRODUCT_ID, transcript);
      const scoringText = await groqScorecard(apiKey, scoringPrompt);
      let scorecard: any = {};
      try {
        let clean = scoringText.trim();
        if (clean.startsWith("```")) clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
        scorecard = JSON.parse(clean);
      } catch {
        const s = scoringText.indexOf("{"), e = scoringText.lastIndexOf("}");
        if (s >= 0 && e > s) try { scorecard = JSON.parse(scoringText.substring(s, e + 1)); } catch { scorecard = { error: "Parse failed" }; }
      }
      updateSession(sessionId!, { status: "completed", endedAt: new Date().toISOString(), transcript, scorecardJson: scorecard });
      if (timerRef.current) clearInterval(timerRef.current);
      window.location.hash = `/scorecard/${sessionId}`;
    } catch (err: any) {
      setEndCallError(err.message); setIsEnding(false);
    }
  };

  if (showIntro) {
    return (<div className="min-h-screen bg-[#e8ecf0]">
      <div className="bg-[#1565a7] text-white flex items-center justify-between px-3 py-1.5"><div className="flex items-center gap-4"><span className="font-bold text-sm tracking-wide">Emerge CRM</span><div className="flex items-center gap-3 text-xs text-blue-100"><span>Menu</span><span>Calendar</span><span>Documents</span><span>My CRM</span></div></div><div className="text-sm font-semibold">Emerge, Inc.</div></div>
      <div className="bg-[#2980c9] px-3 py-1"><span className="text-white font-semibold text-xs">Emerge Sales Leads</span></div>
      <div className="h-[calc(100vh-60px)] bg-[#e8ecf0]" /><IntroPopup onStart={handleIntroStart} /></div>);
  }

  if (!session) return <div className="min-h-screen flex items-center justify-center bg-[#e8ecf0]"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>;

  const persona = PERSONAS[session.personaId];
  const phoneDigits = persona.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const phoneNumber = `(${600 + (phoneDigits % 400)}) 555-${String(1000 + (phoneDigits % 9000)).slice(0, 4)}`;
  const avgGrade = grades.length > 0 ? (["A","B","C","D","F"].find(g => { const sc: Record<string,number> = {A:4,B:3,C:2,D:1,F:0}; const avg = grades.reduce((s,gr) => s+sc[gr.grade],0)/grades.length; return (g==="A"&&avg>=3.5)||(g==="B"&&avg>=2.5&&avg<3.5)||(g==="C"&&avg>=1.5&&avg<2.5)||(g==="D"&&avg>=0.5&&avg<1.5)||(g==="F"&&avg<0.5); }) || "C") : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#e8ecf0] font-sans text-xs">
      <div className="bg-[#1565a7] text-white flex items-center justify-between px-3 py-1.5 flex-shrink-0">
        <div className="flex items-center gap-4"><span className="font-bold text-sm tracking-wide">Emerge CRM</span><div className="flex items-center gap-3 text-xs text-blue-100"><span>Menu</span><span>Calendar</span><span>Documents</span><span>My CRM</span></div></div>
        <div className="text-sm font-semibold">Emerge, Inc.</div>
        <div className="flex items-center gap-3 text-xs text-blue-100"><span>Admin</span><span>Support</span><span className="text-white font-medium">{session.repName.toLowerCase().replace(" ", ".")}@emerge.com</span></div>
      </div>
      <div className="bg-[#2980c9] px-3 py-1 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3"><span className="text-white font-semibold text-xs">Emerge Sales Leads</span><span className="text-blue-200 text-xs">{session.repName}</span></div>
        <div className="flex items-center gap-2"><select className="text-xs px-2 py-0.5 rounded border-0 bg-white text-gray-700"><option>Search All</option></select><input className="text-xs px-2 py-0.5 rounded border-0 w-40" placeholder="Search..." /><button className="bg-[#1565a7] text-white text-xs px-2 py-0.5 rounded">Go</button></div>
      </div>

      {endCallError && <div className="bg-amber-100 border-b border-amber-300 px-3 py-1.5 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /><span className="text-xs text-amber-800">{endCallError}</span><button onClick={handleEndCall} className="ml-auto text-xs bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded">Retry</button></div>}
      {(voiceError || stt.error) && <div className="bg-red-50 border-b border-red-300 px-3 py-2 flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" /><p className="text-xs text-red-700 flex-1">{voiceError || stt.error}</p><button onClick={() => setVoiceError(null)} className="text-xs bg-red-200 hover:bg-red-300 px-2 py-0.5 rounded flex-shrink-0">Dismiss</button></div>}

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT */}
        <div className="w-56 bg-white border-r border-gray-300 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="border-b border-gray-200 px-3 py-1.5 flex items-center gap-3 bg-gray-50"><button className="text-blue-700 font-medium hover:underline">Edit</button><button className="text-blue-700 font-medium hover:underline">Add</button></div>
          <div className="px-3 py-3 border-b border-gray-200">
            <div className="font-bold text-sm text-gray-900">{persona.displayName}</div><div className="text-gray-600 mt-0.5">{persona.title}</div>
            <div className="mt-2"><div className="font-semibold text-gray-800">{persona.company}</div><div className="text-gray-600 mt-0.5">{persona.companyDescription.split(",")[0]}</div></div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-[#1565a7] flex items-center justify-center"><span className="text-white text-[9px]">✉</span></div><span className="text-blue-700 text-xs">{persona.displayName.toLowerCase().replace(" ", ".")}@{persona.company.toLowerCase().replace(/\s+/g, "")}.com</span></div>
              <div className="flex items-center gap-2"><div className="w-5 h-5 rounded-full bg-[#1565a7] flex items-center justify-center"><span className="text-white text-[9px]">☎</span></div><span className="text-gray-700">{phoneNumber}</span></div>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-gray-200"><div className="text-gray-500 mb-1">Lead Status</div><div className="bg-yellow-400 text-black font-semibold px-2 py-0.5 rounded text-xs inline-block">New</div></div>
          <div className="px-3 py-2 border-b border-gray-200 space-y-1 text-[11px]">
            <div className="flex justify-between"><span className="text-gray-500">Contact Time</span><span className="font-mono text-green-700 font-semibold">{formatTime(callDuration)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-700">{contactDate}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Contact Owner</span><span className="text-gray-700">{session.repName}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Exchanges</span><span className="text-gray-700">{grades.length}</span></div>
            {avgGrade && <div className="flex justify-between items-center mt-1"><span className="text-gray-500">Avg Grade</span><span className={`font-bold text-sm px-1.5 rounded ${GRADE_COLORS[avgGrade]}`}>{avgGrade}</span></div>}
          </div>
          <div className="px-3 py-2 flex-1 flex flex-col"><div className="text-gray-500 mb-1 text-[11px]">Call Notes</div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Type notes..." className="flex-1 text-[11px] border border-gray-300 rounded p-1.5 resize-none placeholder-gray-400 min-h-[80px]" /></div>
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-gray-300">
          <div className="flex border-b border-gray-300 bg-gray-50 flex-shrink-0">
            {(["Call Transcript","Demographics","Script","Qualifiers","Sales Info"] as const).map(tab => (
              <div key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-xs cursor-pointer border-r border-gray-300 ${activeTab === tab ? "bg-white text-[#1565a7] font-semibold border-b-2 border-b-[#1565a7]" : "text-gray-600 hover:bg-gray-100"}`}>{tab}</div>
            ))}
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === "Demographics" && <div className="flex-1 overflow-y-auto p-4"><table className="w-full text-xs border-collapse"><tbody>{[["Company",persona.company],["Title",persona.title],["Department",persona.department],["Industry","Medical Device / MedTech"],["Phone",phoneNumber]].map(([l,v]) => <tr key={l} className="border-b border-gray-100"><td className="py-2 px-3 text-gray-500 font-medium w-36 bg-gray-50">{l}</td><td className="py-2 px-3 text-gray-800">{v}</td></tr>)}</tbody></table></div>}
          {activeTab === "Script" && <div className="flex-1 overflow-y-auto p-4"><div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-700 leading-relaxed space-y-3"><p><strong>Opening:</strong> "Hi {persona.displayName.split(" ")[0]}, this is [your name] calling from Emerge. We work exclusively with medical device companies. Do you have 60 seconds?"</p><p><strong>Value:</strong> "We help companies like {persona.company} get a qualified pipeline in 30–60 days."</p><p><strong>Discovery:</strong> "What does your pipeline coverage look like?"</p></div></div>}
          {activeTab === "Qualifiers" && <div className="flex-1 overflow-y-auto p-4"><div className="space-y-3">{[{q:"Pipeline coverage?",w:"Urgency"},{q:"How many field reps?",w:"Gaps"},{q:"Reps prospecting or closing?",w:"Fit"},{q:"Tried outsourced sales before?",w:"Objections"}].map((item,i) => <div key={i} className="bg-gray-50 border border-gray-200 rounded p-2.5"><p className="text-xs font-semibold text-gray-800 mb-1">Q{i+1}: "{item.q}"</p><p className="text-[11px] text-blue-700">Why: {item.w}</p></div>)}</div></div>}
          {activeTab === "Sales Info" && <div className="flex-1 overflow-y-auto p-4"><div className="space-y-2">{["21 days to first appointment","60% lower cost than in-house","Med device trained reps","Salesforce integration","Performance guarantee"].map((pt,i) => <div key={i} className="flex items-start gap-2"><span className="text-green-600 font-bold">✓</span><p className="text-xs text-gray-700">{pt}</p></div>)}</div></div>}

          {activeTab === "Call Transcript" && (
          <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
            <div className="flex items-center justify-center gap-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              {stt.isTranscribing ? <><Loader2 className="w-4 h-4 text-purple-500 animate-spin" /><span className="text-xs font-semibold text-purple-600">Transcribing...</span></> :
               stt.isListening && !isThinking && !isSpeaking ? <><Mic className="w-4 h-4 text-red-500 animate-pulse" /><span className="text-xs font-semibold text-red-600">{stt.interimText || "Listening... speak now"}</span></> :
               isSpeaking ? <><Volume2 className="w-4 h-4 text-blue-500" /><span className="text-xs font-semibold text-blue-600">{persona.displayName.split(" ")[0]} is speaking...</span><div className="flex items-end gap-0.5 h-4 ml-1">{[1,2,3,4,5].map(i => <div key={i} className="w-1 bg-blue-500 rounded-full voice-bar" style={{height:"16px"}} />)}</div></> :
               isThinking ? <><Loader2 className="w-4 h-4 text-gray-500 animate-spin" /><span className="text-xs text-gray-600">{persona.displayName.split(" ")[0]} is thinking...</span></> :
               micEnabled ? <><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-700">Voice active — speak naturally</span></> :
               <><MicOff className="w-4 h-4 text-gray-400" /><span className="text-xs text-gray-500 font-semibold">Muted</span></>}
              <button onClick={() => setMicEnabled(!micEnabled)} className={`ml-2 p-1.5 rounded-full ${micEnabled ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400"}`}>{micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {transcript.length === 0 && <div className="text-center py-10"><div className="text-3xl mb-2">🎙️</div><p className="text-sm font-medium text-gray-600">{persona.displayName} is on the line</p><p className="text-xs text-gray-400 mt-1">Start speaking — your mic is live.</p></div>}
              {transcript.map((msg, idx) => (
                <div key={idx} className={`flex gap-2 ${msg.role === "rep" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${msg.role === "rep" ? "bg-[#1565a7] text-white" : "bg-gray-200 text-gray-600"}`}>{msg.role === "rep" ? session.repName[0]?.toUpperCase() : persona.avatar}</div>
                  <div className={`max-w-[78%] flex flex-col gap-0.5 ${msg.role === "rep" ? "items-end" : "items-start"}`}>
                    <span className={`text-[10px] text-gray-400 ${msg.role === "rep" ? "text-right" : ""}`}>{msg.role === "rep" ? session.repName : persona.displayName.split(" ")[0]}</span>
                    <div className={`rounded px-3 py-2 text-xs leading-relaxed ${msg.role === "rep" ? "bg-[#1565a7] text-white rounded-tr-none" : "bg-gray-100 text-gray-800 border border-gray-200 rounded-tl-none"}`}>{msg.content}</div>
                  </div>
                </div>
              ))}
              {stt.isListening && stt.interimText && !isThinking && <div className="flex gap-2 flex-row-reverse"><div className="w-7 h-7 rounded-full bg-[#1565a7]/50 flex items-center justify-center text-sm text-white">{session.repName[0]?.toUpperCase()}</div><div className="rounded px-3 py-2 text-xs bg-[#1565a7]/30 text-[#1565a7] rounded-tr-none italic">{stt.interimText}...</div></div>}
              {isThinking && <div className="flex gap-2"><div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-sm">{persona.avatar}</div><div className="bg-gray-100 border border-gray-200 rounded rounded-tl-none px-3 py-2"><div className="flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" /><div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:"150ms"}} /><div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{animationDelay:"300ms"}} /></div></div></div>}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-gray-200 pt-2 flex gap-2 items-end flex-shrink-0">
              <textarea className="resize-none text-xs min-h-[50px] max-h-[100px] border border-gray-300 rounded p-2 flex-1 focus:outline-none focus:ring-1 focus:ring-[#1565a7]"
                placeholder="Or type here... (Enter to send)" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} disabled={isThinking || isSpeaking} />
              <button onClick={handleSend} disabled={!input.trim() || isThinking || isSpeaking} className="h-9 w-9 bg-[#1565a7] hover:bg-[#1255a0] disabled:opacity-40 text-white rounded flex items-center justify-center"><Send className="w-4 h-4" /></button>
            </div>
          </div>)}
          </div>
        </div>

        {/* RIGHT */}
        <div className="w-48 bg-white flex flex-col flex-shrink-0">
          <div className="p-2 border-b border-gray-200 bg-gray-50">
            <button disabled={isEnding || transcript.length < 2} onClick={handleEndCall} className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded">
              {isEnding ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scoring...</> : <><PhoneOff className="w-3.5 h-3.5" /> End Call & Score</>}
            </button>
          </div>
          <div className="p-2 border-b border-gray-200"><div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1.5">Call Result</div><div className="space-y-1">{RESULT_BUTTONS.map(r => <button key={r} onClick={() => setSelectedResult(r)} className={`w-full text-left px-3 py-1.5 rounded text-xs font-bold text-white ${selectedResult === r ? RESULT_COLORS[r] + " ring-2 ring-offset-1 ring-gray-400" : RESULT_COLORS[r]}`}>{r}</button>)}</div></div>
          <div className="flex-1 overflow-y-auto p-2"><div className="text-gray-500 text-[10px] uppercase tracking-wide mb-2">Exchange Grades</div>
            {grades.length === 0 ? <p className="text-[10px] text-gray-400 italic">Grades appear after each exchange.</p> :
            <div className="space-y-1.5">{grades.map((g,i) => <div key={i} className="flex items-center gap-2"><span className={`w-6 h-6 rounded font-bold text-xs flex items-center justify-center ${GRADE_COLORS[g.grade]}`}>{g.grade}</span><div className="flex-1 min-w-0"><p className="text-[10px] text-gray-500">Exchange {g.exchange}</p><p className="text-[10px] text-gray-700 truncate">{g.note}</p></div></div>)}</div>}
          </div>
        </div>
      </div>

      <div className="bg-white border-t border-gray-300 flex-shrink-0" style={{ maxHeight: "180px" }}>
        <div className="flex border-b border-gray-200 bg-gray-50"><button className="px-3 py-1.5 text-[11px] text-[#1565a7] font-semibold border-b-2 border-[#1565a7] bg-white">Call History {grades.length > 0 && <span className="ml-1 bg-[#1565a7] text-white rounded-full px-1">{grades.length}</span>}</button></div>
        <div className="overflow-y-auto" style={{ maxHeight: "130px" }}>
          <table className="w-full text-[11px]"><thead className="bg-gray-50 sticky top-0"><tr className="border-b border-gray-200"><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Exchange</th><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Time</th><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Rep Said</th><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Prospect Response</th><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Grade</th><th className="text-left px-3 py-1.5 text-gray-600 font-semibold">Note</th></tr></thead>
          <tbody>{grades.length === 0 ? <tr><td colSpan={6} className="text-center py-3 text-gray-400 italic">No exchanges yet</td></tr> :
            grades.map((g,i) => <tr key={i} className={`border-b border-gray-100 ${i%2===0?"bg-white":"bg-gray-50"}`}><td className="px-3 py-1.5 text-gray-700 font-medium">#{g.exchange}</td><td className="px-3 py-1.5 text-gray-500 font-mono">{formatTime(Math.min(callDuration,g.exchange*45))}</td><td className="px-3 py-1.5 text-gray-700 max-w-[180px] truncate">{g.repText}</td><td className="px-3 py-1.5 text-gray-500 max-w-[180px] truncate">{g.prospectText}</td><td className="px-3 py-1.5"><span className={`font-bold px-1.5 py-0.5 rounded text-xs ${GRADE_COLORS[g.grade]}`}>{g.grade}</span></td><td className="px-3 py-1.5 text-gray-600">{g.note}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
