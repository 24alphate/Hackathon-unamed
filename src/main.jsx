import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Code2,
  ExternalLink,
  FileCheck2,
  Filter,
  Globe2,
  Layers3,
  Link as LinkIcon,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Play,
  Radar,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  UserRoundCheck,
  Users,
  WalletCards,
  X
} from "lucide-react";
import {
  BadgeDecisionSchema,
  ClaimProofSchema,
  EvidenceGraphSchema,
  EvidenceAnalysisSchema,
  JobParsingSchema,
  MatchExplanationSchema,
  RubricEvaluationSchema,
  SkillInferenceSchema,
  conforms
} from "./schemas";
import "./styles.css";

/** API routes: same-origin `/api` in dev/preview (Vite proxy) unless VITE_API_BASE_URL is set. */
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const API_BASE = API_ORIGIN ? `${API_ORIGIN}/api` : "/api";

/** Avoid `response.json()` on empty/HTML (e.g. Vite 502 when API is down) — gives a clear message instead. */
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned non-JSON (HTTP ${res.status}). If you are logging in, run the API in another terminal: npm run api`
      );
    }
  }
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 502 || res.status === 504
          ? "Cannot reach API (start `npm run api` — default http://127.0.0.1:3001)."
          : `Request failed (HTTP ${res.status}).`)
    );
  }
  return data;
}

function parseMaybeJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
const DEMO_PAYMENT_URL = import.meta.env.VITE_DEMO_PAYMENT_URL || "";

// ─── Session helpers ─────────────────────────────────────────────────────────
const SESSION_KEY = "unmapped_session";
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

const starterSubmission = {
  projectDescription: "Responsive fintech landing page with a rates widget, product sections, pricing area, and a validated contact form.",
  githubUrl: "https://github.com/amina/fintech-proof",
  liveUrl: "https://amina-fintech-proof.example.com",
  explanation: "I built a mobile-first landing page. It has responsive hero and product sections, reusable React components, a contact form with validation, and an API-powered exchange-rate widget with loading and error states.",
  videoUrl: ""
};

const aminaProofContext = {
  candidateName: "Amina Okoro",
  originalChallenge: "Build a responsive fintech landing page with API integration and a validated contact form.",
  submissionTitle: "Fintech landing page proof",
  githubUrl: starterSubmission.githubUrl,
  liveUrl: starterSubmission.liveUrl,
  submissionSummary: starterSubmission.explanation
};

// demoEvaluation removed — all evaluations come from POST /api/submissions or /api/analyze-proof

// Static demo data removed — all candidate data now comes from POST /api/jobs/:id/match

const starterJobPost = "I need a frontend developer for a fintech dashboard. They should build a clean transaction interface, connect to API data, handle forms, and make it work well on mobile.";

const EMPLOYER_SHORTLIST_PERCENT = 10;

// Reads proof links directly off the backend candidate object (set by buildProfileFromDb → match endpoint)
function getDemoProofLinks(candidate) {
  const github = candidate?.githubUrl || candidate?.github_url || null;
  const live = candidate?.liveUrl || candidate?.live_url || null;
  if (!github && !live) return null;
  return { githubUrl: github, liveUrl: live };
}

function takeTopPercentByMatch(candidates, percent) {
  if (!candidates?.length) return { shortlist: [], remainder: [] };
  const sorted = [...candidates].sort(
    (a, b) => (b.weightedMatchScore ?? b.match ?? 0) - (a.weightedMatchScore ?? a.match ?? 0)
  );
  const k = Math.max(1, Math.ceil((sorted.length * percent) / 100));
  return { shortlist: sorted.slice(0, k), remainder: sorted.slice(k) };
}

function JourneyStrip({ mode }) {
  const steps =
    mode === "talent"
      ? ["Evidence", "Verification test", "Badge", "Employer match", "Company challenge", "Hire / pay"]
      : ["Role in plain language", "Parsed skills", "Verified shortlist", "Message or challenge", "Ranked work", "Hire / pay"];
  return (
    <div className="journey-strip" data-mode={mode} role="list" aria-label="Product journey">
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && <span className="journey-arrow" aria-hidden>→</span>}
          <span className="journey-step">{label}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function RoleEntryScreen({ onChooseTalent, onChooseEmployer }) {
  return (
    <div className="role-entry-screen">
      <div className="role-entry-inner">
        <header className="role-entry-header">
          <div className="brand role-entry-brand">
            <span className="mark"><Radar size={20} /></span>
            <span>Unmapped</span>
          </div>
          <p className="role-entry-tagline">Evidence-backed skills, then real matches.</p>
        </header>
        <p className="role-entry-prompt">How do you want to use Unmapped?</p>
        <div className="role-entry-cards">
          <button type="button" className="role-card role-card--employer" onClick={onChooseEmployer}>
            <span className="role-card-icon" aria-hidden><Users size={28} /></span>
            <span className="role-card-label">I am looking for talent</span>
            <span className="role-card-sub">Employer · verified shortlist, challenges, hire</span>
            <span className="role-card-cta">Find verified talent <ChevronRight size={18} /></span>
          </button>
          <button type="button" className="role-card role-card--talent" onClick={onChooseTalent}>
            <span className="role-card-icon" aria-hidden><UserRoundCheck size={28} /></span>
            <span className="role-card-label">I want to prove my skills</span>
            <span className="role-card-sub">Talent · proof links, tests, evidence-backed badges</span>
            <span className="role-card-cta">Prove my skills <ChevronRight size={18} /></span>
          </button>
        </div>
        <p className="role-entry-foot">Same platform: proof → badge → match → challenge → hire.</p>
      </div>
    </div>
  );
}

function App() {
  const [chosenPath, setChosenPath] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => getSession());
  const [bootstrap, setBootstrap] = useState(null);
  const [runtimeHealth, setRuntimeHealth] = useState(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState(null);
  const [matchCandidates, setMatchCandidates] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [stage, setStage] = useState("talent");
  const [submitted, setSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [jobParsed, setJobParsed] = useState(false);
  const [parsedJob, setParsedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [challengeSent, setChallengeSent] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/bootstrap`)
      .then((r) => r.json())
      .then((data) => {
        setBootstrap(data);
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.warn("Unmapped: bootstrap failed — using static demo data.");
      });
  }, []);

  useEffect(() => {
    Promise.allSettled([
      fetchJson(`${API_BASE}/health`),
      fetchJson(`${API_BASE}/demo-readiness`)
    ]).then(([health, readiness]) => {
      if (health.status === "fulfilled") setRuntimeHealth(health.value);
      if (readiness.status === "fulfilled") setRuntimeReadiness(readiness.value);
    });
  }, []);

  function handleAuth(session) {
    setSession(session);
    setCurrentUser(session);
    if (session.role === "company") setStage("company");
    else setStage("talent");
  }

  function handleLogout() {
    clearSession();
    setCurrentUser(null);
    setChosenPath(null);
    setEvaluation(null);
    setSubmitted(false);
    setJobParsed(false);
    setParsedJob(null);
  }

  async function openJobFromHistory(job) {
    if (!job?.id) return;
    setActiveJobId(job.id);
    let p = job.parsed;
    if (!p && job.parsed_job_json) {
      try { p = JSON.parse(job.parsed_job_json); } catch { p = null; }
    }
    if (p) {
      setParsedJob(p);
      setJobParsed(true);
    }
    setStage("company");
    try {
      const matchRes = await fetch(`${API_BASE}/jobs/${job.id}/match`, { method: "POST" });
      const data = await matchRes.json();
      if (matchRes.ok && data.candidates?.length) {
        setMatchCandidates(data.candidates);
        setSelectedCandidate(data.candidates[0]);
      } else {
        setMatchCandidates(null);
        setSelectedCandidate(null);
      }
    } catch {
      setMatchCandidates(null);
    }
  }

  const proofScore = useMemo(() => evaluation ? getAverageScore(evaluation) : 0, [evaluation]);
  const runtimeIsLive = runtimeHealth?.evaluator === "openai" && runtimeHealth?.github === "token";

  if (!currentUser) {
    if (!chosenPath) {
      return (
        <RoleEntryScreen
          onChooseTalent={() => setChosenPath("talent")}
          onChooseEmployer={() => setChosenPath("employer")}
        />
      );
    }
    return (
      <AuthScreen
        chosenRole={chosenPath}
        onBack={() => setChosenPath(null)}
        onAuth={handleAuth}
      />
    );
  }

  const shellMode = currentUser.role === "company" ? "employer" : "talent";

  return (
    <main className={`app-shell app-shell--${shellMode}`}>
      <RuntimeTruthBanner health={runtimeHealth} readiness={runtimeReadiness} />
      <section className="hero hero--compact">
        <nav className="nav">
          <div className="brand">
            <span className="mark"><Radar size={20} /></span>
            <span>Unmapped</span>
          </div>
          <div className="nav-actions" aria-label="Main sections">
            {currentUser.role === "talent" && (
              <>
                <button className={stage === "talent" ? "active" : ""} onClick={() => setStage("talent")}>Prove skills</button>
                <button className={stage === "jobmarket" ? "active" : ""} onClick={() => setStage("jobmarket")}>Open roles</button>
                <button className={stage === "profile" ? "active" : ""} onClick={() => setStage("profile")}>Badges &amp; profile</button>
                <button className={stage === "inbox" ? "active" : ""} onClick={() => setStage("inbox")}>Company challenges</button>
              </>
            )}
            {currentUser.role === "company" && (
              <>
                <button className={stage === "company" ? "active" : ""} onClick={() => setStage("company")}>Match talent</button>
                <button className={stage === "candidates" ? "active" : ""} onClick={() => setStage("candidates")}>Talent Graph</button>
                <button className={stage === "execution" ? "active" : ""} onClick={() => setStage("execution")}>Mini hackathon</button>
                <button className={stage === "history" ? "active" : ""} onClick={() => setStage("history")}>Posted roles</button>
              </>
            )}
            <span className="nav-user">{currentUser.name}</span>
            <button className="nav-logout" onClick={handleLogout} title="Log out">Log out</button>
          </div>
        </nav>

        <div className="hero-slim">
          <div className="hero-slim-copy">
            <p className="eyebrow">
              {currentUser.role === "talent" ? (
                <><Target size={16} /> Prove your skills</>
              ) : (
                <><ShieldCheck size={16} /> Find verified talent</>
              )}
            </p>
            <h1>{currentUser.role === "talent" ? "Evidence → test → badge" : "Role → shortlist → challenge"}</h1>
            <p className="lede lede--compact">
              {currentUser.role === "talent"
                ? "Add proof, complete a verification challenge, and earn badges employers can trust."
                : "Describe the role in your own words, review a tight shortlist, then message or invite candidates to a final challenge."}
            </p>
            <JourneyStrip mode={shellMode} />
          </div>
          <aside className="hero-slim-panel" aria-label="Signal summary">
            <div className="panel-top">
              <span>{currentUser.role === "talent" ? "Proof signal" : "Match focus"}</span>
              <strong>{evaluation && currentUser.role === "talent" ? `${proofScore}%` : currentUser.role === "talent" ? "—" : jobParsed ? "Live" : "—"}</strong>
            </div>
            <p className="hero-slim-panel-text">
              {currentUser.role === "talent"
                ? "Badges tie to submitted work, not self-reported CV lines."
                : "Only the strongest matches surface first; expand the pool when you need depth."}
            </p>
            {currentUser.role === "talent" && (
              <button
                type="button"
                className="secondary hero-slim-demo"
                disabled={!runtimeIsLive}
                title={runtimeIsLive ? "Load the static demo submission" : "Disabled until backend reports live OpenAI and GitHub token mode"}
                onClick={() => { setStage("talent"); setSubmitted(true); }}
              >
                <Play size={16} /> Load demo submission
              </button>
            )}
          </aside>
        </div>
      </section>

      <section className="tabs">
        {stage === "talent" && (
          <TalentFlow
            challenge={bootstrap?.challenge}
            demoTalentId={currentUser.userId}
            challengeId={bootstrap?.challenge?.id}
            submitted={submitted}
            setSubmitted={setSubmitted}
            evaluation={evaluation}
            setEvaluation={setEvaluation}
            proofScore={proofScore}
            currentUser={currentUser}
          />
        )}
        {stage === "company" && (
          <CompanyFlow
            companyId={currentUser.role === "company" ? currentUser.profileId : bootstrap?.demoCompanyId}
            activeJobId={activeJobId}
            matchCandidates={matchCandidates}
            setMatchCandidates={setMatchCandidates}
            setActiveJobId={setActiveJobId}
            evaluation={evaluation}
            jobParsed={jobParsed}
            setJobParsed={setJobParsed}
            parsedJob={parsedJob}
            setParsedJob={setParsedJob}
            selectedCandidate={selectedCandidate}
            setSelectedCandidate={setSelectedCandidate}
            setStage={setStage}
          />
        )}
        {stage === "execution" && (
          <ExecutionFlow
            jobId={activeJobId}
            companyId={currentUser.role === "company" ? currentUser.profileId : bootstrap?.demoCompanyId}
            parsedJob={parsedJob}
            selectedCandidate={selectedCandidate}
            challengeSent={challengeSent}
            setChallengeSent={setChallengeSent}
            paid={paid}
            setPaid={setPaid}
          />
        )}
        {stage === "candidates" && currentUser.role === "company" && (
          <TalentGraphIndex
            activeJobId={activeJobId}
            parsedJob={parsedJob}
            matchCandidates={matchCandidates}
          />
        )}
        {stage === "profile" && currentUser.role === "talent" && (
          <TalentProfilePage talentId={currentUser.userId} currentUser={currentUser} />
        )}
        {stage === "jobmarket" && currentUser.role === "talent" && <TalentJobBoard />}
        {stage === "inbox" && currentUser.role === "talent" && (
          <ChallengeInbox talentId={currentUser.userId} currentUser={currentUser} />
        )}
        {stage === "history" && currentUser.role === "company" && (
          <CompanyDashboard
            companyId={currentUser.profileId}
            currentUser={currentUser}
            onSelectJobForMatching={openJobFromHistory}
          />
        )}
      </section>
    </main>
  );
}

function RuntimeTruthBanner({ health, readiness }) {
  if (!health && !readiness) {
    return <div className="warning runtime-truth">Runtime truth: checking backend readiness.</div>;
  }
  const evaluator = health?.evaluator || readiness?.checks?.find((check) => check.name === "llm_evaluator")?.status || "unknown";
  const github = health?.github || readiness?.checks?.find((check) => check.name === "github_evidence")?.status || "unknown";
  const playwright = readiness?.checks?.find((check) => check.name === "runtime_demo_verifier")?.status || "unknown";
  const live = evaluator === "openai" && github === "token";
  return (
    <div className={`warning runtime-truth ${live ? "runtime-truth--live" : ""}`}>
      Runtime truth: AI {evaluator}; GitHub {github}; Playwright {playwright}. {live ? "Backend evidence mode is live." : "Demo shortcuts are disabled until live evidence mode is confirmed."}
    </div>
  );
}

function TalentFlow({ challenge, demoTalentId, challengeId, submitted, setSubmitted, evaluation, setEvaluation, proofScore, currentUser }) {
  const [form, setForm] = useState(starterSubmission);
  const [talentClaims, setTalentClaims] = useState(
    "I can ship responsive product UI, integrate REST APIs, and validate complex forms with strong UX states."
  );
  const [wizardStep, setWizardStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rankedPicks, setRankedPicks] = useState([]);
  const [rankedAll, setRankedAll] = useState([]);
  const [showEntireCatalog, setShowEntireCatalog] = useState(false);
  const diversifyRef = useRef(0);
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [submissionId, setSubmissionId] = useState(null);
  const [verificationPlan, setVerificationPlan] = useState([]);
  const [verifyingTestId, setVerifyingTestId] = useState(null);
  const [testOutputs, setTestOutputs] = useState({});
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationMeta, setRecommendationMeta] = useState(null);

  // Catalog is loaded only when personalized recommendations are needed (step 3).
  // We do NOT pre-populate it from the static catalog — that would show unrelated
  // challenges before the user's input is known.

  useEffect(() => {
    if (submitted && !evaluation) setWizardStep(4);
  }, [submitted, evaluation]);

  useEffect(() => {
    if (wizardStep !== 3) return;
    refreshChallengeRecommendations();
  }, [wizardStep]);

  const activeChallengeId = selectedChallengeId || challengeId || 1;
  const activeChallenge = selectedChallenge || challenge;

  const displayChallenges = useMemo(
    () => (showEntireCatalog ? rankedAll : rankedPicks),
    [showEntireCatalog, rankedAll, rankedPicks]
  );

  async function refreshChallengeRecommendations() {
    setRecommendationLoading(true);
    setRecommendationError("");
    diversifyRef.current += 1;
    try {
      const data = await fetchJson(`${API_BASE}/challenges/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentClaims,
          githubUrl: form.githubUrl,
          liveUrl: form.liveUrl,
          explanation: form.explanation,
          videoUrl: form.videoUrl,
          maxPicks: 5,
          diversifySeed: diversifyRef.current
        })
      });
      const picks = Array.isArray(data.picks) && data.picks.length
        ? data.picks
        : (Array.isArray(data.challenges) ? data.challenges : []);
      const all = Array.isArray(data.allRanked) && data.allRanked.length ? data.allRanked : picks;
      if (picks.length) {
        setRankedPicks(picks);
        setRankedAll(all);
        setShowEntireCatalog(false);
        setRecommendationMeta(data.meta || null);
        const keepCurrent = picks.find((ch) => ch.id === selectedChallengeId) || all.find((ch) => ch.id === selectedChallengeId);
        if (!keepCurrent) {
          setSelectedChallengeId(picks[0].id);
          setSelectedChallenge(picks[0]);
        } else {
          setSelectedChallenge(keepCurrent);
        }
      }
    } catch (requestError) {
      setRecommendationError(requestError.message || "Could not personalize challenges; showing catalog order.");
    } finally {
      setRecommendationLoading(false);
    }
  }

  const submissionProofContext = useMemo(
    () => ({
      candidateName: currentUser?.name || aminaProofContext.candidateName,
      originalChallenge: activeChallenge?.title
        ? `${activeChallenge.title}${activeChallenge.description ? ` — ${activeChallenge.description}` : ""}`
        : aminaProofContext.originalChallenge,
      submissionTitle: form.projectDescription?.slice(0, 140) || "Challenge submission",
      githubUrl: form.githubUrl,
      liveUrl: form.liveUrl,
      videoUrl: form.videoUrl,
      submissionSummary: [talentClaims && `Stated capabilities: ${talentClaims}`, form.explanation].filter(Boolean).join("\n\n")
    }),
    [currentUser?.name, activeChallenge, form.projectDescription, form.githubUrl, form.liveUrl, form.videoUrl, form.explanation, talentClaims]
  );

  async function evaluateSubmission(event) {
    event.preventDefault();
    if (!form.projectDescription && !form.explanation && !form.githubUrl && !form.liveUrl) {
      setError("Add at least a project description or GitHub URL before submitting.");
      return;
    }
    setSubmitted(true);
    setLoading(true);
    setError("");

    const tid = demoTalentId || 1;
    const cid = activeChallengeId;
    const mergedProjectDescription = [
      talentClaims.trim() && `What I believe I can do:\n${talentClaims.trim()}`,
      form.projectDescription.trim()
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const analysis = await fetchJson(`${API_BASE}/analyze-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectDescription: mergedProjectDescription,
          githubUrl: form.githubUrl,
          liveUrl: form.liveUrl,
          explanation: form.explanation,
          videoUrl: form.videoUrl || undefined
        })
      });

      const data = await fetchJson(`${API_BASE}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId: tid,
          challengeId: cid,
          projectDescription: mergedProjectDescription,
          githubUrl: form.githubUrl,
          liveUrl: form.liveUrl,
          explanation: form.explanation,
          videoUrl: form.videoUrl || undefined
        })
      });
      const testsResp = await fetchJson(`${API_BASE}/generate-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: data.submissionId })
      });
      setEvaluation(data.evaluation || analysis.evaluation || data);
      setSubmissionId(data.submissionId || null);
      setVerificationPlan(Array.isArray(testsResp.tests) ? testsResp.tests : (Array.isArray(data.verificationPlan) ? data.verificationPlan : []));
    } catch (requestError) {
      setError(requestError.message || "Could not reach the evaluator API. Is the server running?");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerificationTest(testId) {
    if (!submissionId) return;
    const output = String(testOutputs[testId] || "").trim();
    if (!output) {
      setError("Add your test output/implementation notes before submitting the verification test.");
      return;
    }
    setVerifyingTestId(testId);
    setError("");
    try {
      const data = await fetchJson(`${API_BASE}/submissions/${submissionId}/verification-tests/${testId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output, notes: "Candidate submitted verification output." })
      });
      const badgeState = await fetchJson(`${API_BASE}/award-badge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      });
      setVerificationPlan(badgeState.tests || data.tests || []);
      setEvaluation((current) => ({
        ...(current || {}),
        earnedBadges: badgeState.earnedBadges || data.earnedBadges || [],
        badgeUnlockStatus: badgeState.badgeUnlockStatus || data.badgeUnlockStatus || current?.badgeUnlockStatus,
        verificationTests: badgeState.tests || data.tests || current?.verificationTests || []
      }));
    } catch (requestError) {
      setError(requestError.message || "Could not update verification result.");
    } finally {
      setVerifyingTestId(null);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function goNext() {
    setError("");
    if (wizardStep === 1 && !talentClaims.trim()) {
      setError("Describe what you believe you can deliver.");
      return;
    }
    if (wizardStep === 2 && !form.githubUrl && !form.liveUrl && !form.explanation.trim()) {
      setError("Add at least one proof link or a short written explanation.");
      return;
    }
    setWizardStep((s) => Math.min(4, s + 1));
  }

  function goBack() {
    setError("");
    setWizardStep((s) => Math.max(1, s - 1));
  }

  return (
    <div className="flow-grid flow-grid--talent">
      <aside className="rail rail--talent">
        <Step done={wizardStep > 1} icon={<UserRoundCheck size={18} />} title="Profile & claims" text="What you believe you can own." />
        <Step done={wizardStep > 2} icon={<LinkIcon size={18} />} title="Proof links" text="GitHub, demo, walkthrough, narrative." />
        <Step done={wizardStep > 3} icon={<Code2 size={18} />} title="Verification test" text="Pick the challenge you will ship against." />
        <Step done={submitted} icon={<UploadCloud size={18} />} title="Submit work" text="Artifact summary + run Proof Engine." />
        <Step done={Boolean(evaluation)} icon={<BadgeCheck size={18} />} title="Badges" text="Evidence-backed awards with confidence." />
      </aside>

      <div className="workspace workspace--talent">
        <div className="section-head">
          <div>
            <p className="eyebrow"><Target size={16} /> Talent · prove your skills</p>
            <h2>Earn evidence-backed badges</h2>
            <p className="section-sub">
              {evaluation ? "Proof Engine results — review badges and evidence." : `Step ${wizardStep} of 4 — same backend, clearer path.`}
            </p>
          </div>
          <span className="api-pill">{evaluation ? `${evaluation.source} evaluator` : "API ready"}</span>
        </div>

        <div className="talent-wizard-nav">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={`talent-wizard-dot ${wizardStep === n ? "active" : ""} ${wizardStep > n ? "done" : ""}`}
              onClick={() => { if (n < wizardStep || (n === 4 && wizardStep === 4)) setWizardStep(n); }}
            >
              {n}
            </button>
          ))}
        </div>

        {wizardStep === 1 && (
          <div className="talent-panel">
            <h3>1 · Your profile &amp; stated capabilities</h3>
            <p className="muted">
              This is what you believe you can do. The Proof Engine will compare it to your links and your test submission.
            </p>
            <label>
              What you believe you can deliver
              <textarea
                value={talentClaims}
                onChange={(e) => setTalentClaims(e.target.value)}
                rows={5}
                placeholder="e.g. I can own responsive dashboards, hook them to REST APIs, and ship accessible forms."
              />
            </label>
            <div className="wizard-actions">
              <button type="button" className="primary" onClick={goNext}>
                Continue to proof links <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div className="talent-panel">
            <h3>2 · Proof links &amp; narrative</h3>
            <p className="muted">Share how someone can verify your work before the timed challenge.</p>
            <div className="form-grid">
              <label>
                GitHub
                <input
                  value={form.githubUrl}
                  onChange={(e) => updateField("githubUrl", e.target.value)}
                  placeholder="https://github.com/user/project"
                />
              </label>
              <label>
                Live demo / portfolio
                <input
                  value={form.liveUrl}
                  onChange={(e) => updateField("liveUrl", e.target.value)}
                  placeholder="https://…"
                />
              </label>
            </div>
            <label>
              Optional walkthrough (video URL)
              <input
                value={form.videoUrl}
                onChange={(e) => updateField("videoUrl", e.target.value)}
                placeholder="https://youtube.com/… or Loom"
              />
            </label>
            <label>
              Short explanation
              <textarea
                value={form.explanation}
                onChange={(e) => updateField("explanation", e.target.value)}
                rows={4}
                placeholder="What should a reviewer look at first?"
              />
            </label>
            <div className="wizard-actions">
              <button type="button" className="secondary" onClick={goBack}><ChevronLeft size={18} /> Back</button>
              <button type="button" className="primary" onClick={goNext}>Continue to verification test <ChevronRight size={18} /></button>
            </div>
          </div>
        )}

        {wizardStep === 3 && (
          <div className="talent-panel">
            <h3>3 · Your verification test</h3>
            <p className="muted">
              Recommended from your step 1 claims, step 2 evidence, and employer demand signals. We surface your top matches from the full catalog (not the same fixed list every time). Pick one challenge to ship.
            </p>
            {recommendationMeta?.totalInCatalog > 0 && (
              <p className="muted">
                Showing {displayChallenges.length} of {recommendationMeta.totalInCatalog} challenges
                {rankedPicks.length > 0 && rankedAll.length > rankedPicks.length && !showEntireCatalog
                  ? ` (top ${rankedPicks.length} matches)`
                  : ""}
                .
              </p>
            )}
            {/* ── Personalization signal strip ──────────────────────────── */}
            {recommendationMeta && (
              <div className="recommend-signal-strip">
                <span className={`recommend-source-badge source-${recommendationMeta.skillsSource?.replace(/\+/g, "_")}`}>
                  {recommendationMeta.skillsSource === "proof_engine+text"
                    ? <><Sparkles size={13} /> Personalized by Proof Engine + your profile</>
                    : recommendationMeta.skillsSource === "text_only"
                      ? <><Target size={13} /> Personalized from your profile text</>
                      : <><Filter size={13} /> Catalog order (add profile text to personalize)</>}
                </span>
                {recommendationMeta.inferredSkills?.length > 0 && (
                  <span className="recommend-skills-used">
                    Skills used: {recommendationMeta.inferredSkills.slice(0, 5).join(" · ")}
                  </span>
                )}
              </div>
            )}

            <div className="wizard-actions wizard-actions--compact">
              <button type="button" className="secondary" onClick={refreshChallengeRecommendations} disabled={recommendationLoading}>
                {recommendationLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                {recommendationLoading ? "Re-ranking for your profile…" : "Re-rank for my profile"}
              </button>
            </div>

            {recommendationError && <p className="error">{recommendationError}</p>}

            {recommendationLoading && displayChallenges.length === 0 && (
              <div className="catalog-loading-placeholder">
                <LoaderCircle className="spin" size={22} />
                <p>Ranking challenges against your profile from steps 1 &amp; 2…</p>
              </div>
            )}

            {!recommendationLoading && displayChallenges.length === 0 && !recommendationError && (
              <div className="catalog-empty">
                <p>
                  {recommendationMeta?.noMatchReason ||
                    "No challenges matched your profile yet. Go back and add more detail to steps 1 and 2, then come back."}
                </p>
                <p className="muted" style={{ marginTop: 8 }}>
                  You can still continue to step 4 and describe your proof directly — the Proof Engine will evaluate whatever you submit.
                </p>
              </div>
            )}

            {displayChallenges.length > 0 && (
              <div className={`challenge-catalog ${recommendationLoading ? "catalog-loading" : ""}`}>
                {recommendationLoading && (
                  <div className="catalog-loading-overlay">
                    <LoaderCircle className="spin" size={22} />
                    <span>Re-ranking…</span>
                  </div>
                )}
                <div className="catalog-grid">
                  {displayChallenges.map((ch, idx) => {
                    const isTop = !showEntireCatalog && idx === 0 && typeof ch.recommendation_score === "number" && ch.recommendation_score > 0;
                    const rankLabel = showEntireCatalog ? null : idx === 0 ? "Best match" : idx === 1 ? "#2 match" : idx === 2 ? "#3 match" : null;
                    const reasons = Array.isArray(ch.recommendation_reasons) ? ch.recommendation_reasons : [];
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        className={`catalog-card ${selectedChallengeId === ch.id ? "active" : ""} ${isTop ? "catalog-card--top" : ""}`}
                        onClick={() => { setSelectedChallengeId(ch.id); setSelectedChallenge(ch); }}
                      >
                        {rankLabel && <span className="catalog-rank-badge">{rankLabel}</span>}
                        <strong>{ch.title}</strong>
                        <p>{ch.description?.slice(0, 120)}{ch.description?.length > 120 ? "…" : ""}</p>
                        {reasons.length > 0 && (
                          <div className="catalog-reasons">
                            {reasons.map((r) => (
                              <span key={r} className="catalog-reason-chip">{r}</span>
                            ))}
                          </div>
                        )}
                        <div className="catalog-skills">
                          {(ch.skill_targets || []).slice(0, 4).map((s) => <span key={s}>{s}</span>)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="wizard-actions">
              <button type="button" className="secondary" onClick={goBack}><ChevronLeft size={18} /> Back</button>
              <button type="button" className="primary" onClick={goNext}>Continue to submit <ChevronRight size={18} /></button>
            </div>
          </div>
        )}

        {wizardStep === 4 && (
          <>
            <div className="challenge challenge--wizard">
              <div>
                <h3>{activeChallenge?.title || "Verification challenge"}</h3>
                <p>{activeChallenge?.description || "Complete the build, then describe what you shipped."}</p>
              </div>
              <div className="requirements">
                {["Claim-aware", "Evidence-backed", "Employer-relevant", "Depth-tested"].map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>
            <div className="proof-explain-card">
              <p className="eyebrow"><UploadCloud size={14} /> How to submit your proof</p>
              <ol style={{ margin: "8px 0 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Write what you built — features, decisions, what was hardest</li>
                <li>Paste your GitHub repo link (the evaluator will read your code)</li>
                <li>Add a live demo link if deployed</li>
                <li>Hit <strong>Submit &amp; run Proof Engine</strong> — badges are awarded automatically</li>
              </ol>
            </div>
            <form className="submission-form" onSubmit={evaluateSubmission}>
              <label>
                What did you build? <span className="field-required">*</span>
                <textarea
                  placeholder={`Describe what you built for "${activeChallenge?.title || "this challenge"}". What features did you implement? What decisions did you make? What was hardest?`}
                  value={form.projectDescription}
                  onChange={(e) => updateField("projectDescription", e.target.value)}
                  rows={5}
                />
              </label>
              <label>
                GitHub repo for this challenge
                <input
                  type="url"
                  placeholder="https://github.com/you/your-project"
                  value={form.githubUrl}
                  onChange={(e) => updateField("githubUrl", e.target.value)}
                />
              </label>
              <label>
                Live demo URL (deployed build)
                <input
                  type="url"
                  placeholder="https://your-project.vercel.app"
                  value={form.liveUrl}
                  onChange={(e) => updateField("liveUrl", e.target.value)}
                />
              </label>
              <label>
                Anything else the evaluator should know? (optional)
                <textarea
                  placeholder="Implementation notes, trade-offs, what you'd improve, libraries used…"
                  value={form.explanation}
                  onChange={(e) => updateField("explanation", e.target.value)}
                  rows={3}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={goBack}><ChevronLeft size={18} /> Back</button>
                <button className="primary" type="submit" disabled={loading}>
                  {loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                  {loading ? "Running Proof Engine…" : "Submit & run Proof Engine"}
                </button>
              </div>
              <p className="form-hint">No file upload — evaluation uses your description + proof links + automated repo/demo checks.</p>
              {error && <p className="error">{error}</p>}
            </form>
          </>
        )}

        {submitted && wizardStep >= 4 && (
          <div className="submission">
            <div className="submission-row">
              <LinkIcon size={18} />
              <span>{form.githubUrl || "No GitHub URL"}</span>
              <strong>{form.liveUrl ? "Live demo attached" : "Live demo missing"}</strong>
            </div>
          </div>
        )}

        {evaluation && (
          <>
            {verificationPlan.length > 0 && (
              <article className="deep-panel">
                <p className="eyebrow"><Code2 size={16} /> Skill verification gate</p>
                <h3>Badges unlock only after passing each skill test</h3>
                {!!evaluation.skillHypotheses?.length && (
                  <div className="candidate-proof-links">
                    {evaluation.skillHypotheses.slice(0, 6).map((h) => (
                      <span key={`${h.skill}-${h.status}`}>{h.skill}: {h.status}</span>
                    ))}
                  </div>
                )}
                <div className="candidate-badges">
                  {(evaluation.provisionalBadges || []).map((badge) => (
                    <span key={badge.title} className="mini-badge">{badge.title} · {badge.badgeStage || "detected"}</span>
                  ))}
                </div>
                <div className="risk-list">
                  {verificationPlan.map((test) => (
                    <div key={test.id} className="risk-item">
                      <div>
                        <div className="test-header">
                          <strong>{test.skillName}</strong>
                          {test.testSpec?.adaptive_tier && (
                            <span className={`adaptive-tier-badge tier-${test.testSpec.adaptive_tier}`}>
                              {test.testSpec.adaptive_tier === "depth" ? "⬆ Depth" :
                               test.testSpec.adaptive_tier === "proof" ? "● Proof" :
                               test.testSpec.adaptive_tier === "foundational" ? "⬇ Foundational" :
                               test.testSpec.adaptive_tier === "carried_forward" ? "✓ Carried forward" :
                               "Evidence needed"}
                            </span>
                          )}
                          {test.testSpec?.time_limit_minutes > 0 && (
                            <span className="test-time-limit">{test.testSpec.time_limit_minutes} min</span>
                          )}
                        </div>
                        <p>{test.challengePrompt}</p>
                        <small>Status: {test.status} · Stage: {test.badgeStage || "detected"} · Score: {Math.round(test.score || 0)}</small>
                        {test.testSpec?.adaptive_reason && (
                          <small className="adaptive-reason">{test.testSpec.adaptive_reason}</small>
                        )}
                        {(() => {
                          const checks = parseMaybeJson(test.evaluationJson);
                          if (!checks?.artifactSignals && !checks?.evidenceRequiredChecks) return null;
                          const artifactSignals = checks.artifactSignals || {};
                          const requiredChecks = checks.evidenceRequiredChecks || {};
                          const gradingReport = checks.gradingReport || null;
                          return (
                            <>
                              <div className="candidate-proof-links">
                                {Object.entries(requiredChecks).map(([key, value]) => (
                                  <span key={key}>{key}: {value ? "passed" : "missing"}</span>
                                ))}
                                {artifactSignals.hasRepoLink && <span>repo link detected</span>}
                                {artifactSignals.hasLiveLink && <span>live link detected</span>}
                                {artifactSignals.hasCodeBlock && <span>code snippet detected</span>}
                                {artifactSignals.hasFilePath && <span>file path detected</span>}
                                {artifactSignals.hasCommitReference && <span>commit/PR evidence detected</span>}
                                {checks.artifactVerification?.fileRefetchVerified && <span>GitHub file refetched</span>}
                                {checks.artifactVerification?.liveRechecked && <span>live demo rechecked</span>}
                              </div>
                              {gradingReport && (
                                <div className="match-section">
                                  <strong>Evidence-verified grading</strong>
                                  <p>This submission is evidence-verified but not fully executed in a sandbox.</p>
                                  <div className="candidate-proof-links">
                                    <span>Decision: {gradingReport.final_decision}</span>
                                    <span>Confidence: {Math.round(gradingReport.confidence || 0)}%</span>
                                    <span>Verified artifacts: {gradingReport.verified_artifacts?.length || 0}</span>
                                    <span>Missing artifacts: {gradingReport.missing_artifacts?.length || 0}</span>
                                  </div>
                                  {!!gradingReport.code_pattern_matches?.length && (
                                    <div className="candidate-proof-links">
                                      {gradingReport.code_pattern_matches.map((item) => (
                                        <span key={item.name}>{item.name}: {item.matched ? "found" : "not found"}</span>
                                      ))}
                                    </div>
                                  )}
                                  {!!gradingReport.explanation_cross_check?.unsupported_claims?.length && (
                                    <small className="adaptive-reason">
                                      Unsupported claims: {gradingReport.explanation_cross_check.unsupported_claims.join(", ")}
                                    </small>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {test.testSpec && (
                          <div className="match-section">
                            <strong>{test.testSpec.test_title || "Targeted test spec"}</strong>
                            <p>Time limit: {test.testSpec.time_limit_minutes || "n/a"} min</p>
                            {!!test.testSpec.requirements?.length && (
                              <p>Requirements: {test.testSpec.requirements.slice(0, 3).join(" · ")}</p>
                            )}
                            {!!test.testSpec.acceptance_criteria?.length && (
                              <p>Acceptance: {test.testSpec.acceptance_criteria.slice(0, 2).join(" · ")}</p>
                            )}
                          </div>
                        )}
                        <textarea
                          rows={3}
                          placeholder="Paste implementation proof: GitHub/PR/commit link, live demo link, relevant file path or code snippet, plus edge cases handled."
                          value={testOutputs[test.id] || test.candidateOutput || ""}
                          onChange={(e) => setTestOutputs((curr) => ({ ...curr, [test.id]: e.target.value }))}
                        />
                      </div>
                      <div className="candidate-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={verifyingTestId === test.id}
                          onClick={() => submitVerificationTest(test.id)}
                        >
                          {verifyingTestId === test.id ? "Evaluating…" : "Submit test output"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )}
            {(() => {
              const g = evaluation.githubEvidence;
              if (!g) return null;
              if (g.source === "github") {
                return (
                  <p className="github-evidence-hint ok" role="status">
                    Repository evidence: fetched from GitHub{g.owner && g.repo
                      ? ` (${g.owner}/${g.repo}, ${g.fileCount} paths).`
                      : "."}
                  </p>
                );
              }
              if (g.source === "simulated" && form.githubUrl) {
                return (
                  <p className="github-evidence-hint warn" role="status">
                    Repository evidence: not fetched from GitHub (private repo, network, or rate limit). Using simulated structure for the demo.{g.fetchError ? ` ${g.fetchError}` : ""}
                  </p>
                );
              }
              return null;
            })()}
            <EvaluationResult
              evaluation={evaluation}
              proofScore={proofScore}
              currentUser={currentUser}
              submissionProofContext={submissionProofContext}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EvaluationResult({ evaluation, proofScore, currentUser, submissionProofContext }) {
  const [selectedBadgeProof, setSelectedBadgeProof] = useState(null);
  const proofContext = useMemo(
    () => ({
      candidateName: submissionProofContext?.candidateName || currentUser?.name || aminaProofContext.candidateName,
      originalChallenge: submissionProofContext?.originalChallenge || aminaProofContext.originalChallenge,
      submissionTitle: submissionProofContext?.submissionTitle || aminaProofContext.submissionTitle,
      githubUrl: submissionProofContext?.githubUrl || aminaProofContext.githubUrl,
      liveUrl: submissionProofContext?.liveUrl || aminaProofContext.liveUrl,
      videoUrl: submissionProofContext?.videoUrl || "",
      submissionSummary: submissionProofContext?.submissionSummary || starterSubmission.explanation
    }),
    [submissionProofContext, currentUser?.name]
  );

  return (
    <>
      <ScoreCard proofScore={proofScore} evaluation={evaluation} currentUser={currentUser} />
      {evaluation.warning && <p className="warning">{evaluation.warning}</p>}
      {!evaluation.earnedBadges?.length && evaluation.provisionalBadges?.length ? (
        <p className="warning">Badge candidates found, but still locked until verification tests are passed per skill.</p>
      ) : null}

      {evaluation.proofAnalysis && (
        <ProofAnalysis analysis={evaluation.proofAnalysis} />
      )}

      {conforms(EvidenceGraphSchema, evaluation.evidenceGraph) && (
        <EvidenceGraphView graph={evaluation.evidenceGraph} />
      )}

      {conforms(ClaimProofSchema, evaluation.claimProofAnalysis) && (
        <ClaimProofView items={evaluation.claimProofAnalysis} />
      )}

      <DeepEvaluationPanels evaluation={evaluation} />

      <div className="result-grid">
        <article className="result-panel">
          <h3>Strengths</h3>
          <ul>{(evaluation.strengths || []).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className="result-panel">
          <h3>Weaknesses</h3>
          <ul>{(evaluation.weaknesses || []).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </div>

      <article className="summary-panel">
        <p className="eyebrow"><MessageSquareText size={16} /> Employer summary</p>
        <p>{evaluation.employerSummary}</p>
      </article>

      <article className="summary-panel">
        <p className="eyebrow"><ScanSearch size={16} /> Evidence explanation</p>
        <p>{evaluation.evidenceExplanation}</p>
      </article>

      <div className="skill-list">
        {(evaluation.skillScores || []).map((skill) => (
          <article className="skill" key={skill.skill}>
            <div>
              <h3>{skill.skill}</h3>
              <p>{skill.evidence}</p>
              {skill.confidenceBreakdown && (
                <p className="skill-breakdown">
                  Strength {skill.confidenceBreakdown.evidence_strength}% · Completeness {skill.confidenceBreakdown.evidence_completeness}% ·
                  Ambiguity {skill.confidenceBreakdown.ambiguity_level} · Risk {skill.confidenceBreakdown.inference_risk}
                </p>
              )}
              {skill.tier && (
                <span className={`tier-pill tier-${skill.tier}`}>
                  {skill.tier === "direct" ? "✓ artifact proven" : skill.tier === "inferred" ? "~ structure inferred" : "~ claimed"}
                </span>
              )}
              {skill.lifecycleState && (
                <span className={`lifecycle-pill lifecycle-${skill.lifecycleState}`}>
                  {skill.lifecycleState.replace(/_/g, " ")}
                </span>
              )}
              {skill.negativeEvidencePenalty > 0 && (
                <span className="neg-penalty-pill" title="Confidence reduced by negative evidence">
                  −{skill.negativeEvidencePenalty}pts negative signal
                </span>
              )}
            </div>
            <strong>{Math.round(skill.score)}</strong>
          </article>
        ))}
      </div>

      <div className="badge-grid">
        {(evaluation.earnedBadges || []).map((badge) => (
          <button
            className="badge"
            key={badge.title}
            type="button"
            onClick={() => setSelectedBadgeProof(createBadgeProof(badge, evaluation, proofContext))}
          >
            <BadgeCheck size={24} />
            <h3>{badge.title}</h3>
            {badge.levelLabel && <span className="badge-level-label">{badge.levelLabel}</span>}
            {badge.badgeStage && <span className="badge-level-label">{badge.badgeStage.toUpperCase()}</span>}
            <p className="badge-challenge-ref">
              <strong>Challenge:</strong>{" "}
              {proofContext.originalChallenge?.length > 100
                ? `${proofContext.originalChallenge.slice(0, 100)}…`
                : proofContext.originalChallenge}
            </p>
            <p className="badge-evidence-snippet"><strong>Evidence:</strong> {badge.evidence}</p>
            <p className="badge-work-snippet"><strong>Submitted work:</strong> {proofContext.submissionTitle}</p>
            <div className="badge-inline-scores">
              <span>{Math.round(badge.score)}% confidence</span>
              <span className="badge-open-hint">Details: why awarded, links, checklist →</span>
            </div>
            {badge.evaluatorSource && (
              <span className={`evaluator-pill ${badge.evaluatorSource}`}>
                {badge.evaluatorSource === "openai" ? "GPT-4 evaluated" : "⚠ keyword fallback"}
              </span>
            )}
          </button>
        ))}
      </div>
      {selectedBadgeProof && (
        <BadgeProofModal proof={selectedBadgeProof} onClose={() => setSelectedBadgeProof(null)} />
      )}
    </>
  );
}

function ProofAnalysis({ analysis }) {
  const liveDemo = analysis.live_demo_analysis;
  const videoEvidence = analysis.video_evidence;
  const staticSignals = analysis.static_signals;
  return (
    <section className="proof-analysis">
      <div className="proof-analysis-head">
        <div>
          <p className="eyebrow"><ScanSearch size={16} /> AI Proof Analysis</p>
          <h2>{analysis.project_type}</h2>
        </div>
        <div className="confidence-meter">
          <strong>{Math.round(analysis.confidence_score)}</strong>
          <span>confidence</span>
        </div>
      </div>

      <div className="analysis-grid">
        <article>
          <h3>Project type</h3>
          <p>{analysis.project_type}</p>
        </article>
        <article>
          <h3>Complexity</h3>
          <p>{analysis.complexity_level}</p>
        </article>
      </div>

      {analysis.skill_graph && (
        <SkillGraph graph={analysis.skill_graph} />
      )}

      <div className="analysis-grid">
        <article>
          <h3>Features detected</h3>
          <div className="analysis-tags">
            {(analysis.features_detected || []).map((feature) => <span key={feature}>{feature}</span>)}
          </div>
        </article>
        <article>
          <h3>Skills inferred</h3>
          <div className="analysis-tags">
            {(analysis.skills_inferred || []).map((skill) => <span key={skill}>{skill}</span>)}
          </div>
        </article>
      </div>

      {(liveDemo || staticSignals || videoEvidence) && (
        <div className="analysis-grid">
          {liveDemo && (
            <article>
              <h3>Live demo runtime check</h3>
              <p>{liveDemo.inspected ? "Inspected with Playwright" : `Not fully inspected (${liveDemo.reason || "unknown"})`}</p>
              <p>
                Requests: {liveDemo.networkRequestCount || 0} · Console errors: {liveDemo.consoleErrorCount || 0} ·
                API detected: {liveDemo.apiRequestDetected ? "yes" : "no"} · Responsive evidence: {liveDemo.responsiveEvidence ? "yes" : "no"}
              </p>
              {liveDemo.screenshots?.length > 0 && (
                <div className="playwright-screenshots">
                  {liveDemo.screenshots.map((s) => (
                    <div key={s.viewport} className="playwright-screenshot">
                      <span>{s.viewport}</span>
                      <img
                        src={`/api/screenshots/${encodeURIComponent(s.path.split(/[\\/]/).pop())}`}
                        alt={`${s.viewport} screenshot`}
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}
            </article>
          )}
          {staticSignals && (
            <article>
              <h3>Static code signals</h3>
              <p>
                Framework: {staticSignals.framework || "unknown"} · API: {staticSignals.api_usage_detected ? "yes" : "no"} ·
                Forms: {staticSignals.form_handling_detected ? "yes" : "no"} · Responsive classes: {staticSignals.responsive_classes_detected ? "yes" : "no"}
              </p>
            </article>
          )}
          {videoEvidence && (
            <article>
              <h3>Video claim cross-check</h3>
              <p>{videoEvidence.provided ? `Platform: ${videoEvidence.platform}` : "No video provided."}</p>
              <p>Matched claims: {(videoEvidence.matched_to_evidence || []).length} · Unverified claims: {(videoEvidence.unverified_claims || []).length}</p>
            </article>
          )}
        </div>
      )}

      <article className="analysis-reasoning">
        <h3>Reasoning</h3>
        <p>{analysis.reasoning}</p>
      </article>

      <div className="analysis-grid">
        <article>
          <h3>README signal</h3>
          <pre>{analysis.github_readme_excerpt}</pre>
        </article>
        <article>
          <h3>File structure signal</h3>
          <pre>{(analysis.file_structure || []).length ? analysis.file_structure.join("\n") : "No repository structure available."}</pre>
        </article>
      </div>
    </section>
  );
}

function EvidenceGraphView({ graph }) {
  const skillNodes = graph.nodes.filter((node) => node.type === "skill");

  return (
    <section className="evidence-graph">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Layers3 size={16} /> Evidence Graph</p>
          <h2>Why the system believes these skills</h2>
        </div>
        <span className="api-pill">{graph.nodes.length} nodes · {graph.edges.length} edges</span>
      </div>

      <div className="graph-paths">
        {skillNodes.map((skill) => {
          const incoming = graph.edges.filter((edge) => edge.to === skill.id);
          return (
            <article className="graph-skill" key={skill.id}>
              <h3>{skill.label}</h3>
              <p>{skill.summary}</p>
              <div className="graph-edge-list">
                {incoming.map((edge) => {
                  const from = graph.nodes.find((node) => node.id === edge.from);
                  return (
                    <div className={`graph-edge ${edge.type}`} key={`${edge.from}-${edge.to}-${edge.type}`}>
                      <span>{from?.type || "node"}</span>
                      <strong>{from?.label || edge.from}</strong>
                      <small>{edge.type}: {edge.reason}</small>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ClaimProofView({ items }) {
  return (
    <section className="claim-proof">
      <div className="section-head">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> Claim vs Proof</p>
          <h2>What was claimed, proven, and inferred</h2>
        </div>
      </div>
      <div className="claim-proof-list">
        {items.map((item) => (
          <article className="claim-proof-card" key={item.skill}>
            <div className="claim-proof-head">
              <h3>{item.skill}</h3>
              <span className={`risk-pill ${item.risk_if_wrong}`}>{item.confidence}% · {item.risk_if_wrong} risk</span>
            </div>
            <div className="claim-proof-grid">
              <div>
                <strong>Claimed skill</strong>
                <p>{item.claim}</p>
              </div>
              <div>
                <strong>Proven evidence</strong>
                <ul>{item.observed_evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
              </div>
              <div>
                <strong>AI inference</strong>
                <p>{item.inference}</p>
                <div className="match-chip-row">
                  {item.derived_features.map((feature) => <span key={feature}>{feature}</span>)}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SkillGraph({ graph }) {
  return (
    <article className="skill-graph">
      <div>
        <h3>Skill Graph</h3>
        <p>Inferred skills grouped into capability categories.</p>
      </div>
      <div className="skill-bars">
        {graph.map((item) => (
          <div className="skill-bar-row" key={item.category}>
            <div className="skill-bar-label">
              <strong>{item.category}</strong>
              <span>{Math.round(item.score)}%</span>
            </div>
            <div className="skill-bar-track" aria-label={`${item.category} ${Math.round(item.score)} percent`}>
              <span style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }}></span>
            </div>
            <p>{item.skills.length ? item.skills.join(", ") : "No strong evidence yet"}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function DeepEvaluationPanels({ evaluation }) {
  const evidenceObject = conforms(EvidenceAnalysisSchema, evaluation.evidenceObject) ? evaluation.evidenceObject : null;
  const inferredSkillsDetailed = conforms(SkillInferenceSchema, evaluation.inferredSkillsDetailed) ? evaluation.inferredSkillsDetailed : null;
  const rubricEvaluation = conforms(RubricEvaluationSchema, evaluation.rubricEvaluation) ? evaluation.rubricEvaluation : null;
  const badgeDecisions = conforms(BadgeDecisionSchema, evaluation.badgeDecisions) ? evaluation.badgeDecisions : null;
  if (!evidenceObject && !rubricEvaluation && !inferredSkillsDetailed && !badgeDecisions && !evaluation.decisionTrace && !evaluation.badgeDecisionTrace?.length && !evaluation.skillScores?.length) return null;

  return (
    <section className="deep-panels">
      {evidenceObject && (
        <article className="deep-panel">
          <p className="eyebrow"><ScanSearch size={16} /> Project Evidence Parser</p>
          <h3>{evidenceObject.project_type} - {evidenceObject.domain_context}</h3>
          <div className="deep-grid">
            <FactList title="Proof signals" items={evidenceObject.proof_signals} />
            <FactList title="Weak signals" items={evidenceObject.weak_signals} />
            <FactList title="Missing evidence" items={evidenceObject.missing_evidence} />
            <FactList title="Authenticity risks" items={evidenceObject.authenticity_risks} />
          </div>
        </article>
      )}

      {inferredSkillsDetailed && (
        <article className="deep-panel">
          <p className="eyebrow"><BadgeCheck size={16} /> Skill Inference Engine</p>
          <div className="inference-list">
            {inferredSkillsDetailed.map((skill) => (
              <div className="inference-row" key={skill.skill_name}>
                <div>
                  <h3>{skill.skill_name}</h3>
                  <p>{skill.why_it_proves_skill}</p>
                  <small>To increase confidence: {skill.what_would_increase_confidence}</small>
                </div>
                <div>
                  <strong>{Math.round(skill.confidence_score)}%</strong>
                  <span>{skill.category}</span>
                  <span>{skill.level}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {rubricEvaluation && (
        <article className="deep-panel">
          <p className="eyebrow"><FileCheck2 size={16} /> Rubric Evaluation</p>
          <div className="rubric-grid">
            {rubricEvaluation.map((item) => (
              <div className="rubric-item" key={item.dimension}>
                <strong>{item.dimension}</strong>
                <span>{Math.round(item.score)}</span>
                <p>{item.reasoning}</p>
              </div>
            ))}
          </div>
        </article>
      )}

      {badgeDecisions && (
        <article className="deep-panel">
          <p className="eyebrow"><ShieldCheck size={16} /> Badge Decision Logic</p>
          <div className="inference-list">
            {badgeDecisions.map((badge) => (
              <div className="inference-row" key={badge.badge_name}>
                <div>
                  <h3>{badge.badge_name} ({badge.badge_level})</h3>
                  <p>{badge.why_awarded}</p>
                  <small>Why not higher: {badge.why_not_higher_level}</small>
                </div>
                <div>
                  <strong>{Math.round(badge.confidence)}%</strong>
                  <span>confidence</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      <ClaimProofTable evaluation={evaluation} />

      {evaluation.negativeEvidence?.flags?.length > 0 && (
        <article className="deep-panel neg-evidence-panel">
          <p className="eyebrow"><X size={16} /> Negative Evidence ({evaluation.negativeEvidence.flags.length} signal{evaluation.negativeEvidence.flags.length > 1 ? "s" : ""})</p>
          <p className="neg-evidence-summary">{evaluation.negativeEvidence.summary}</p>
          <div className="neg-flag-list">
            {evaluation.negativeEvidence.flags.map((f) => (
              <div key={f.signal} className={`neg-flag-row neg-flag-${f.severity}`}>
                <div>
                  <strong>{f.signal.replace(/_/g, " ")}</strong>
                  <p>{f.description}</p>
                </div>
                <div className="neg-flag-meta">
                  <span className={`sev-badge sev-${f.severity}`}>{f.severity}</span>
                  <span className="neg-penalty">−{f.penalty}pts</span>
                </div>
              </div>
            ))}
          </div>
          <p className="neg-total-penalty">Total confidence penalty: −{evaluation.negativeEvidence.totalPenalty} pts</p>
        </article>
      )}

      {evaluation.badgeDecisionTrace?.length > 0 && (
        <article className="deep-panel">
          <p className="eyebrow"><ShieldCheck size={16} /> Badge Gate Trace</p>
          <div className="inference-list">
            {evaluation.badgeDecisionTrace.slice(0, 8).map((row) => (
              <div className="inference-row" key={`${row.skill}-${row.score}`}>
                <div>
                  <h3>{row.skill}</h3>
                  <p>{row.awarded ? "Awarded" : "Rejected"} · Failed gates: {row.failedGates?.length ? row.failedGates.join(", ") : "none"}</p>
                  {row.rejectReason && <small>{row.rejectReason}</small>}
                </div>
                <div>
                  <strong>{Math.round(row.score)}%</strong>
                  <span>{row.awarded ? `L${row.level}` : "no badge"}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      )}

      {evaluation.badgeDecisionTrace?.some((row) => !row.awarded) && (
        <article className="deep-panel">
          <p className="eyebrow"><X size={16} /> Badge Refusal Logic</p>
          <div className="refusal-list">
            {evaluation.badgeDecisionTrace
              .filter((row) => !row.awarded)
              .slice(0, 8)
              .map((row) => (
                <div className="refusal-row" key={`reject-${row.skill}-${row.score}`}>
                  <div>
                    <strong>{row.skill}</strong>
                    <p>Badge not awarded. Evidence insufficient.</p>
                    <small>{row.rejectReason || "Failed one or more required gates."}</small>
                  </div>
                  <span>{Math.round(row.score)}%</span>
                </div>
              ))}
          </div>
        </article>
      )}

      {evaluation.decisionTrace && (
        <article className="deep-panel">
          <p className="eyebrow"><Layers3 size={16} /> Evaluation Decision Trace</p>
          <div className="deep-grid">
            <FactList
              title="Deterministic signals"
              items={[
                `Proof strength: ${evaluation.decisionTrace.deterministic?.proofStrength ?? "n/a"}`,
                `Confidence: ${evaluation.decisionTrace.deterministic?.confidence ?? "n/a"}`,
                `Direct skills: ${evaluation.decisionTrace.deterministic?.directSkillCount ?? 0}`,
                `Inferred skills: ${evaluation.decisionTrace.deterministic?.inferredSkillCount ?? 0}`
              ]}
            />
            <FactList
              title="Badge summary"
              items={[
                `Considered: ${evaluation.decisionTrace.badgeSummary?.consideredSkills ?? 0}`,
                `Awarded: ${evaluation.decisionTrace.badgeSummary?.awardedBadges ?? 0}`,
                ...(evaluation.decisionTrace.badgeSummary?.rejectedSkills?.slice(0, 3).map((s) => `Rejected: ${s}`) || [])
              ]}
            />
          </div>
        </article>
      )}

      {evaluation.uncertainty && (
        <article className="deep-panel">
          <p className="eyebrow"><MessageSquareText size={16} /> Confidence & Uncertainty</p>
          <div className="deep-grid">
            <FactList title="Known" items={evaluation.uncertainty.known} />
            <FactList title="Assumptions" items={evaluation.uncertainty.assumptions} />
            <FactList title="Missing" items={evaluation.uncertainty.missing} />
            <FactList title="Human review needed" items={evaluation.uncertainty.human_review_needed} />
          </div>
        </article>
      )}
    </section>
  );
}

function FactList({ title, items = [] }) {
  return (
    <div className="fact-list">
      <strong>{title}</strong>
      <ul>{(items.length ? items : ["None flagged"]).map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function ClaimProofTable({ evaluation }) {
  const claimRows = conforms(ClaimProofSchema, evaluation.claimProofAnalysis)
    ? evaluation.claimProofAnalysis.map((row) => ({
      skill: row.skill,
      claim: row.claim,
      observed: row.observed_evidence?.join(" · ") || "No strong proof evidence found.",
      confidence: row.confidence,
      risk: row.risk_if_wrong || "unknown"
    }))
    : (evaluation.skillScores || []).slice(0, 8).map((row) => ({
      skill: row.skill,
      claim: row.tier === "claimed" ? `Candidate claims ${row.skill}` : `System inferred ${row.skill}`,
      observed: row.evidence || "No direct evidence listed.",
      confidence: Math.round(row.score || 0),
      risk: row.tier === "direct" ? "low" : row.tier === "inferred" ? "medium" : "high"
    }));

  if (!claimRows.length) return null;

  return (
    <article className="deep-panel">
      <p className="eyebrow"><ShieldCheck size={16} /> Claim vs Proof Table</p>
      <div className="claim-proof-table-wrap">
        <table className="claim-proof-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Claim</th>
              <th>Observed proof</th>
              <th>Confidence</th>
              <th>Risk if wrong</th>
            </tr>
          </thead>
          <tbody>
            {claimRows.map((row) => (
              <tr key={`${row.skill}-${row.claim}`}>
                <td>{row.skill}</td>
                <td>{row.claim}</td>
                <td>{row.observed}</td>
                <td>{Math.round(row.confidence)}%</td>
                <td>{row.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function CompanyFlow({
  companyId,
  activeJobId,
  matchCandidates,
  setMatchCandidates,
  setActiveJobId,
  evaluation,
  jobParsed,
  setJobParsed,
  parsedJob,
  setParsedJob,
  selectedCandidate,
  setSelectedCandidate,
  setStage
}) {
  const [jobPost, setJobPost] = useState(starterJobPost);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBadgeProof, setSelectedBadgeProof] = useState(null);
  const [compareNames, setCompareNames] = useState(["Amina Okoro", "Kofi Mensah"]);

  // ── Candidate Index filters ─────────────────────────────────────────────────
  const [filterSkill, setFilterSkill] = useState("");
  const [filterMinPS, setFilterMinPS] = useState(0);
  const [filterMinConf, setFilterMinConf] = useState(0);
  const [filterIntegrity, setFilterIntegrity] = useState("any");
  const [filterHasBadges, setFilterHasBadges] = useState(false);
  const [filterCountry, setFilterCountry] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showFullPool, setShowFullPool] = useState(false);
  const candidateMatches = useMemo(() => {
    if (!Array.isArray(matchCandidates) || !matchCandidates.length) return [];
    return matchCandidates.filter((c) => {
      if (filterMinPS > 0 && (c.proofStrength ?? c.aggregatedProofStrength ?? 0) < filterMinPS) return false;
      if (filterMinConf > 0) {
        const conf = c.explainableMatch?.confidence || c.hiringDecision?.confidence || 0;
        if (conf < filterMinConf) return false;
      }
      if (filterIntegrity !== "any") {
        const riskOrder = { low: 0, medium: 1, high: 2 };
        const max = riskOrder[filterIntegrity] ?? 2;
        const cRisk = riskOrder[c.integrityTier?.replace("_risk", "") || "medium"] ?? 1;
        if (cRisk > max) return false;
      }
      if (filterHasBadges && !(c.badges?.length > 0)) return false;
      if (filterCountry && c.country?.toLowerCase() !== filterCountry.toLowerCase()) return false;
      if (filterSkill) {
        const q = filterSkill.toLowerCase();
        const hasSkill = (c.matchedSkills || []).some((s) => s.toLowerCase().includes(q)) ||
          (c.strongMatches || []).some((s) => s.toLowerCase().includes(q));
        if (!hasSkill) return false;
      }
      return true;
    });
  }, [matchCandidates, filterSkill, filterMinPS, filterMinConf, filterIntegrity, filterHasBadges, filterCountry]);
  const { shortlist, remainder } = useMemo(
    () => takeTopPercentByMatch(candidateMatches, EMPLOYER_SHORTLIST_PERCENT),
    [candidateMatches]
  );
  const displayList = showFullPool ? candidateMatches : shortlist;

  useEffect(() => {
    if (!jobParsed || !shortlist.length) return;
    const inShort = shortlist.some((c) => c.name === selectedCandidate?.name);
    if (!inShort) setSelectedCandidate(shortlist[0]);
  }, [jobParsed, shortlist, selectedCandidate?.name, setSelectedCandidate]);

  const selectedMatch = candidateMatches.find((candidate) => candidate.name === selectedCandidate?.name) || candidateMatches[0] || null;
  const comparisonCandidates = compareNames
    .map((name) => candidateMatches.find((candidate) => candidate.name === name))
    .filter(Boolean);

  async function parseJob(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (companyId) {
        const create = await fetch(`${API_BASE}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, rawDescription: jobPost })
        });
        const created = await create.json();
        if (!create.ok) {
          throw new Error(created.error || "Job create failed.");
        }
        setActiveJobId(created.jobId);
        const { jobId: _jid, source: _s, model: _m, warning: _w, ...rest } = created;
        setParsedJob(rest);
        setJobParsed(true);

        const matchRes = await fetch(`${API_BASE}/jobs/${created.jobId}/match`, { method: "POST" });
        const matchData = await matchRes.json();
        if (matchRes.ok && matchData.candidates?.length) {
          setMatchCandidates(matchData.candidates);
          setSelectedCandidate(matchData.candidates[0]);
        }
      } else {
        const response = await fetch(`${API_BASE}/parse-job`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobPost })
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Job parsing failed.");
        }
        setParsedJob(data);
        setJobParsed(true);
      }
    } catch (requestError) {
      setError(requestError.message || "Could not reach the job parser API.");
    } finally {
      setLoading(false);
    }
  }

  function updateParsedField(field, value) {
    setParsedJob((current) => ({ ...current, [field]: value }));
  }

  function updateListField(field, value) {
    updateParsedField(field, value.split("\n").map((item) => item.trim()).filter(Boolean));
  }

  function updateWeight(field, value) {
    setParsedJob((current) => ({
      ...current,
      matching_weights: {
        ...current.matching_weights,
        [field]: Number(value)
      }
    }));
  }

  function toggleCompare(name) {
    setCompareNames((current) => {
      if (current.includes(name)) {
        return current.filter((item) => item !== name);
      }
      return [...current, name].slice(-2);
    });
  }

  function logOutcome(action, candidate = selectedMatch, extra = {}) {
    const talentId = candidate?.talentId || candidate?.talent_id || candidate?.id;
    if (!activeJobId || !talentId) return;
    fetch(`${API_BASE}/match-outcomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: activeJobId, talentId, action, ...extra })
    }).catch(() => {
      // non-blocking telemetry for future matching calibration
    });
  }

  return (
    <div className="company-layout company-layout--employer">
      <div className="workspace workspace--employer">
        <div className="section-head">
          <div>
            <p className="eyebrow"><BriefcaseBusiness size={16} /> Employer · find verified talent</p>
            <h2>Describe the role; get a verified shortlist</h2>
            <p className="section-sub">Natural language → structured skills → top {EMPLOYER_SHORTLIST_PERCENT}% match slice → message or mini hackathon.</p>
          </div>
          <span className="api-pill">{parsedJob ? `${parsedJob.source} parser` : "API ready"}</span>
        </div>

        <form className="submission-form" onSubmit={parseJob}>
          <label>
            What you are looking for (plain language)
            <textarea
              value={jobPost}
              onChange={(event) => setJobPost(event.target.value)}
              rows={5}
            />
          </label>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {loading ? "Parsing" : "Parse Job With AI"}
            </button>
            <p>The backend turns employer language into skills, deliverables, a final challenge, and matching weights.</p>
          </div>
          {error && <p className="error">{error}</p>}
        </form>

        {jobParsed && parsedJob && (
          <>
            {parsedJob.warning && <p className="warning">{parsedJob.warning}</p>}

            <div className="parsed editable-parse">
              <label>
                Role title
                <input
                  value={parsedJob.role_title}
                  onChange={(event) => updateParsedField("role_title", event.target.value)}
                />
              </label>

              <div className="form-grid">
                <label>
                  Must-have / required skills
                  <textarea
                    value={(parsedJob.required_skills || []).join("\n")}
                    onChange={(event) => updateListField("required_skills", event.target.value)}
                    rows={6}
                  />
                </label>
                <label>
                  Nice-to-have skills
                  <textarea
                    value={(parsedJob.nice_to_have_skills || []).join("\n")}
                    onChange={(event) => updateListField("nice_to_have_skills", event.target.value)}
                    rows={6}
                  />
                </label>
              </div>

              <label>
                Deliverables
                <textarea
                  value={(parsedJob.deliverables || []).join("\n")}
                  onChange={(event) => updateListField("deliverables", event.target.value)}
                  rows={4}
                />
              </label>

              <label>
                Recommended final challenge (mini hackathon)
                <textarea
                  value={parsedJob.test_challenge}
                  onChange={(event) => updateParsedField("test_challenge", event.target.value)}
                  rows={4}
                />
              </label>

              <div>
                <h3>Matching weights</h3>
                <div className="weight-grid">
                  {Object.entries(parsedJob.matching_weights).map(([key, value]) => (
                    <label key={key}>
                      {key.replaceAll("_", " ")}
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={value}
                        onChange={(event) => updateWeight(key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="requirements">
                {parsedJob.required_skills.map((skill) => <span key={skill}>{skill}</span>)}
              </div>
            </div>

            <JobDepthPanel parsedJob={parsedJob} />

            <MarketInsightPanel candidates={candidateMatches} parsedJob={parsedJob} />

            {/* ── Talent Graph Filter Bar ──────────────────────────────── */}
            <div className="filter-bar">
              <div className="filter-bar-head">
                <span className="eyebrow"><Filter size={14} /> Talent Graph Filters</span>
                <button type="button" className="secondary filter-toggle" onClick={() => setFiltersOpen((v) => !v)}>
                  {filtersOpen ? "Hide filters" : `Filters${(filterSkill || filterMinPS > 0 || filterMinConf > 0 || filterHasBadges || filterCountry || filterIntegrity !== "any") ? " ●" : ""}`}
                </button>
              </div>
              {filtersOpen && (
                <div className="filter-grid">
                  <label>
                    Skill (any match)
                    <input
                      value={filterSkill}
                      onChange={(e) => setFilterSkill(e.target.value)}
                      placeholder="e.g. React, API Integration"
                    />
                  </label>
                  <label>
                    Min skill reliability
                    <input type="number" min="0" max="100" value={filterMinPS}
                      onChange={(e) => setFilterMinPS(Number(e.target.value))} />
                  </label>
                  <label>
                    Min confidence
                    <input type="number" min="0" max="100" value={filterMinConf}
                      onChange={(e) => setFilterMinConf(Number(e.target.value))} />
                  </label>
                  <label>
                    Max integrity risk
                    <select value={filterIntegrity} onChange={(e) => setFilterIntegrity(e.target.value)}>
                      <option value="any">Any</option>
                      <option value="low">Low only</option>
                      <option value="medium">Low or medium</option>
                    </select>
                  </label>
                  <label>
                    Country
                    <input value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} placeholder="Nigeria, Ghana…" />
                  </label>
                  <label className="filter-checkbox">
                    <input type="checkbox" checked={filterHasBadges} onChange={(e) => setFilterHasBadges(e.target.checked)} />
                    Has verified badges only
                  </label>
                  <button type="button" className="secondary" onClick={() => { setFilterSkill(""); setFilterMinPS(0); setFilterMinConf(0); setFilterIntegrity("any"); setFilterHasBadges(false); setFilterCountry(""); }}>
                    Clear all
                  </button>
                </div>
              )}
            </div>

            <div className="shortlist-toolbar">
              <p>
                <strong>Shortlist:</strong> top {EMPLOYER_SHORTLIST_PERCENT}% by match ({shortlist.length} of {candidateMatches.length}).
                {!showFullPool && remainder.length > 0 && (
                  <span> {remainder.length} additional candidate{remainder.length !== 1 ? "s" : ""} hidden.</span>
                )}
              </p>
              {!candidateMatches.length && (
                <span className="warning">No backend matches yet. Parse the job and run backend match first.</span>
              )}
              {remainder.length > 0 && (
                <button type="button" className="secondary shortlist-toggle" onClick={() => setShowFullPool((v) => !v)}>
                  {showFullPool ? "Show shortlist only" : `Show full pool (${remainder.length} more)`}
                </button>
              )}
            </div>

            <div className="candidate-list">
              {(() => {
                const above = displayList.filter((c) => !c.belowThreshold);
                const below = displayList.filter((c) => c.belowThreshold);
                return (
                  <>
                    {above.map((candidate) => renderCandidateCard(candidate, selectedCandidate, setSelectedCandidate, compareNames, toggleCompare, setSelectedBadgeProof, evaluation, null))}
                    {below.length > 0 && (
                      <>
                        <div className="threshold-divider">
                          <span>Below must-have threshold (&lt;40% coverage) — {below.length} candidate{below.length > 1 ? "s" : ""}</span>
                        </div>
                        {below.map((candidate) => renderCandidateCard(candidate, selectedCandidate, setSelectedCandidate, compareNames, toggleCompare, setSelectedBadgeProof, evaluation, null))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
            <CompareCandidatesPanel candidates={comparisonCandidates} parsedJob={parsedJob} allCandidates={candidateMatches} />
          </>
        )}
      </div>

      <aside className="selection">
        <p className="eyebrow"><ShieldCheck size={16} /> Selected candidate</p>
        {selectedMatch ? (
          <>
            <h2>{selectedMatch.name}</h2>
            <p>{selectedMatch.proof}</p>
            <div className="match-ring">{selectedMatch.weightedMatchScore || selectedMatch.match}%</div>
          </>
        ) : (
          <p className="warning">No backend-ranked candidate selected yet.</p>
        )}
        {selectedMatch?.matchExplanation && (
          <div className="match-aside">
            <div className={`decision-banner ${selectedMatch.hiringDecision.recommendationKey}`}>
              <strong>{selectedMatch.hiringDecision.recommendation}</strong>
              <span>{selectedMatch.hiringDecision.confidence}% confidence</span>
            </div>
            <strong>{selectedMatch.skillOverlapScore}% skill overlap</strong>
            <p>{selectedMatch.matchExplanation}</p>
            {(selectedMatch.semanticExplanation || selectedMatch.explainableMatch?.semanticExplanation) && (
              <p><span>Semantic:</span> {selectedMatch.semanticExplanation || selectedMatch.explainableMatch.semanticExplanation}</p>
            )}
            <p><span>Why:</span> {selectedMatch.hiringDecision.justification}</p>
            <p><span>Risk:</span> {selectedMatch.hiringDecision.riskAnalysis.join(" ")}</p>
            <p><span>Explainable match:</span> {selectedMatch.explainableMatch.recommendation}</p>
            <p><span>Must-have:</span> {selectedMatch.explainableMatch.mustHaveCoverage}% coverage · <span>Nice-to-have:</span> {selectedMatch.explainableMatch.niceToHaveCoverage}% coverage · <span>Risk score:</span> {selectedMatch.explainableMatch.riskScore}</p>
            {selectedMatch.strongMatches.length > 0 && (
              <p><span>Strong:</span> {selectedMatch.strongMatches.join(", ")}</p>
            )}
            {selectedMatch.missingSkills.length > 0 && (
              <p><span>Missing:</span> {selectedMatch.missingSkills.join(", ")}</p>
            )}
            <p><span>Next:</span> {selectedMatch.hiringDecision.nextStep}</p>
            {selectedMatch.uncertainty && (
              <div className="match-section">
                <strong>Structured uncertainty</strong>
                <p><span>Known:</span> {(selectedMatch.uncertainty.known || []).slice(0, 2).join(" · ") || "n/a"}</p>
                <p><span>Missing:</span> {(selectedMatch.uncertainty.missing || []).slice(0, 2).join(" · ") || "none"}</p>
              </div>
            )}
            {selectedMatch.decisionTrace && (
              <div className="match-section">
                <strong>Decision trace</strong>
                <p>
                  Raw {selectedMatch.decisionTrace.rawScore} → Final {selectedMatch.decisionTrace.finalScore} ·
                  Penalties: conf {selectedMatch.decisionTrace.penalties?.confidencePenalty ?? 0},
                  integrity {selectedMatch.decisionTrace.penalties?.integrityPenalty ?? 0},
                  mock {selectedMatch.decisionTrace.penalties?.mockEvaluatorPenalty ?? 0}
                </p>
              </div>
            )}
            <GrowthPathMini growthPath={selectedMatch.growthPath} />
          </div>
        )}
        <div className="selection-actions">
          <button type="button" className="secondary" onClick={() => { logOutcome("shortlisted"); window.alert("Demo: employer messaging would open here (email or in-app thread)."); }}>
            <Mail size={18} /> Message candidate
          </button>
          <button className="primary" onClick={() => { logOutcome("challenge_sent"); setStage("execution"); }} disabled={!selectedMatch}>
            <ChevronRight size={18} /> Mini hackathon / final challenge
          </button>
        </div>
      </aside>
      {selectedBadgeProof && (
        <BadgeProofModal proof={selectedBadgeProof} onClose={() => setSelectedBadgeProof(null)} />
      )}
    </div>
  );
}

function TalentGraphIndex({ activeJobId, parsedJob, matchCandidates }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [badgeFilter, setBadgeFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [minProofStrength, setMinProofStrength] = useState(0);
  const [rankingMode, setRankingMode] = useState("top10");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchJson(`${API_BASE}/candidates`)
      .then((data) => {
        if (!cancelled) setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "Could not load candidate index.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const matchByCandidate = useMemo(() => {
    const map = new Map();
    (matchCandidates || []).forEach((candidate) => {
      const score = candidate.weightedMatchScore ?? candidate.match ?? candidate.skillOverlapScore ?? null;
      if (candidate.id) map.set(String(candidate.id), { ...candidate, score });
      if (candidate.talentId) map.set(String(candidate.talentId), { ...candidate, score });
      if (candidate.name) map.set(candidate.name.toLowerCase(), { ...candidate, score });
    });
    return map;
  }, [matchCandidates]);

  const countries = useMemo(
    () => [...new Set(candidates.map((candidate) => candidate.country).filter(Boolean))].sort(),
    [candidates]
  );
  const poolStats = useMemo(() => buildTalentPoolStats(candidates, matchCandidates || []), [candidates, matchCandidates]);

  const rankedCandidates = useMemo(() => {
    const skillNeedle = skillFilter.trim().toLowerCase();
    const badgeNeedle = badgeFilter.trim().toLowerCase();
    const countryNeedle = countryFilter.trim().toLowerCase();
    const withMatch = candidates.map((candidate) => {
      const match = matchByCandidate.get(String(candidate.id)) || matchByCandidate.get(candidate.name?.toLowerCase());
      return {
        ...candidate,
        ...(match || {}),
        matchScore: match?.score ?? null,
        matchExplanation: match?.matchExplanation || match?.hiringDecision?.justification || ""
      };
    });
    const filtered = withMatch.filter((candidate) => {
      if (skillNeedle) {
        const skills = (candidate.skills || []).map((skill) => String(skill.skill || "").toLowerCase());
        if (!skills.some((skill) => skill.includes(skillNeedle))) return false;
      }
      if (badgeNeedle) {
        const badges = (candidate.badges || []).map((badge) => String(badge.title || "").toLowerCase());
        if (!badges.some((badge) => badge.includes(badgeNeedle))) return false;
      }
      if (countryNeedle && String(candidate.country || "").toLowerCase() !== countryNeedle) return false;
      if (Number(candidate.confidence || 0) < minConfidence) return false;
      if (Number(candidate.proofStrength || 0) < minProofStrength) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => {
      const aRank = a.matchScore ?? a.profileStrength ?? a.proofStrength ?? 0;
      const bRank = b.matchScore ?? b.profileStrength ?? b.proofStrength ?? 0;
      return bRank - aRank;
    });
    if (rankingMode === "all") return sorted;
    const percent = rankingMode === "top5" ? 5 : 10;
    return sorted.slice(0, Math.max(1, Math.ceil((sorted.length * percent) / 100)));
  }, [badgeFilter, candidates, countryFilter, matchByCandidate, minConfidence, minProofStrength, rankingMode, skillFilter]);

  const totalAfterFilters = useMemo(() => {
    const skillNeedle = skillFilter.trim().toLowerCase();
    const badgeNeedle = badgeFilter.trim().toLowerCase();
    const countryNeedle = countryFilter.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const skills = (candidate.skills || []).map((skill) => String(skill.skill || "").toLowerCase());
      const badges = (candidate.badges || []).map((badge) => String(badge.title || "").toLowerCase());
      return (!skillNeedle || skills.some((skill) => skill.includes(skillNeedle))) &&
        (!badgeNeedle || badges.some((badge) => badge.includes(badgeNeedle))) &&
        (!countryNeedle || String(candidate.country || "").toLowerCase() === countryNeedle) &&
        Number(candidate.confidence || 0) >= minConfidence &&
        Number(candidate.proofStrength || 0) >= minProofStrength;
    }).length;
  }, [badgeFilter, candidates, countryFilter, minConfidence, minProofStrength, skillFilter]);

  function clearTalentFilters() {
    setSkillFilter("");
    setBadgeFilter("");
    setCountryFilter("");
    setMinConfidence(0);
    setMinProofStrength(0);
    setRankingMode("top10");
  }

  return (
    <div className="talent-index">
      <div className="section-head">
        <div>
          <p className="eyebrow"><ScanSearch size={16} /> Talent Graph</p>
          <h2>Verified Talent Pool</h2>
          <p className="section-sub">
            Evidence → Skill Reliability → Verified Badge → Talent Graph → Semantic Match → Hiring Decision.
          </p>
        </div>
        <span className="api-pill">{activeJobId ? `Job #${activeJobId} match-aware` : "No active job"}</span>
      </div>

      <VerifiedTalentPoolPanel stats={poolStats} />
      <CvVsSkillIdentityPanel />
      <LearningSignalPanel />

      <div className="talent-index-controls">
        <label>
          Skill
          <input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} placeholder="API Integration" />
        </label>
        <label>
          Badge
          <input value={badgeFilter} onChange={(event) => setBadgeFilter(event.target.value)} placeholder="Verified API" />
        </label>
        <label>
          Country
          <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
            <option value="">All countries</option>
            {countries.map((country) => <option key={country} value={country.toLowerCase()}>{country}</option>)}
          </select>
        </label>
        <label>
          Min confidence
          <input type="number" min="0" max="100" value={minConfidence} onChange={(event) => setMinConfidence(Number(event.target.value))} />
        </label>
        <label>
          Min skill reliability
          <input type="number" min="0" max="100" value={minProofStrength} onChange={(event) => setMinProofStrength(Number(event.target.value))} />
        </label>
        <label>
          Ranking
          <select value={rankingMode} onChange={(event) => setRankingMode(event.target.value)}>
            <option value="top10">Top 10%</option>
            <option value="top5">Top 5%</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={clearTalentFilters}>Clear</button>
      </div>

      <div className="talent-index-summary">
        <span>{loading ? "Loading candidates..." : `${rankedCandidates.length} shown from ${totalAfterFilters} matching candidates`}</span>
        {parsedJob?.role_title && <span>Ranked for: {parsedJob.role_title}</span>}
        {poolStats.demoProfiles > 0 && <span>{poolStats.demoProfiles} simulated/demo profile{poolStats.demoProfiles !== 1 ? "s" : ""} labeled in pool</span>}
        {error && <span className="error">{error}</span>}
      </div>

      <TalentGraphMarketInsight stats={poolStats} parsedJob={parsedJob} />

      <div className="talent-index-list">
        {rankedCandidates.map((candidate, index) => (
          <TalentIndexCard key={candidate.id || candidate.name} candidate={candidate} rank={index + 1} hasActiveJob={Boolean(activeJobId && matchCandidates?.length)} />
        ))}
        {!loading && !rankedCandidates.length && (
          <div className="empty-state">
            <strong>No candidates match these filters.</strong>
            <p>Lower the proof/confidence threshold or clear one filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function buildTalentPoolStats(candidates = [], matchCandidates = []) {
  const matchMap = new Map();
  matchCandidates.forEach((candidate) => {
    if (candidate.id) matchMap.set(String(candidate.id), candidate);
    if (candidate.talentId) matchMap.set(String(candidate.talentId), candidate);
    if (candidate.name) matchMap.set(candidate.name.toLowerCase(), candidate);
  });
  const allSkills = candidates.flatMap((candidate) => candidate.skills || []);
  const verifiedSkills = allSkills.filter((skill) => {
    const label = getSkillProofLabel(skill);
    return label === "Strong" || label === "Verified Strong" || Number(skill.score || 0) >= 75;
  }).length;
  const demoProfiles = candidates.filter((candidate) =>
    (candidate.badges || []).some((badge) => badge.evaluatorSource === "seed" || badge.evaluatorSource === "mock") ||
    String(candidate.liveUrl || "").includes(".example.com") ||
    String(candidate.githubUrl || "").includes("/amina/")
  ).length;
  const combos = new Map();
  candidates.forEach((candidate) => {
    const combo = [...(candidate.skills || [])]
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, 2)
      .map((skill) => skill.skill)
      .filter(Boolean)
      .join(" + ");
    if (combo) combos.set(combo, (combos.get(combo) || 0) + 1);
  });
  const topCombinations = [...combos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([combo, count]) => ({ combo, count }));
  const matched = candidates.map((candidate) => matchMap.get(String(candidate.id)) || matchMap.get(candidate.name?.toLowerCase())).filter(Boolean);
  const coreQualified = matched.length
    ? matched.filter((candidate) => Number(candidate.skillOverlapScore || 0) >= 60 && Number(candidate.weightedMatchScore || 0) >= 75).length
    : candidates.filter((candidate) => Number(candidate.proofStrength || 0) >= 70 && Number(candidate.confidence || 0) >= 75).length;
  const rareCombinations = topCombinations.filter((item) => item.count <= Math.max(1, Math.floor(candidates.length / 4)));
  return {
    totalCandidates: candidates.length,
    verifiedSkills,
    demoProfiles,
    topCombinations,
    rareCombinations: rareCombinations.length ? rareCombinations : topCombinations.slice(-2),
    coreQualified,
    matchedPoolSize: matched.length || candidates.length
  };
}

function VerifiedTalentPoolPanel({ stats }) {
  return (
    <section className="pool-panel">
      <div className="pool-stat-grid">
        <article><strong>{stats.totalCandidates}</strong><span>total candidates</span></article>
        <article><strong>{stats.verifiedSkills}</strong><span>reliable skill signals</span></article>
        <article><strong>{stats.demoProfiles}</strong><span>simulated/demo profiles</span></article>
      </div>
      <div className="pool-combos">
        <span>Top skill combinations</span>
        <div>
          {stats.topCombinations.map((item) => (
            <mark key={item.combo}>{item.combo} ({item.count})</mark>
          ))}
        </div>
      </div>
    </section>
  );
}

function TalentGraphMarketInsight({ stats, parsedJob }) {
  return (
    <section className="market-panel talent-market-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Globe2 size={16} /> Market Insight</p>
          <h2>Only {stats.coreQualified} of {stats.matchedPoolSize} candidates meet the must-have bar.</h2>
        </div>
        <span className="market-signal scarce">Skill supply signal</span>
      </div>
      <p>
        {parsedJob?.role_title
          ? `For ${parsedJob.role_title}, the tightest combinations are ${stats.rareCombinations.map((item) => item.combo).join(", ") || "still emerging in this pool"}.`
          : `Rare skill combinations include ${stats.rareCombinations.map((item) => item.combo).join(", ") || "the highest-reliability skill pairs in this pool"}.`}
      </p>
    </section>
  );
}

function LearningSignalPanel() {
  return (
    <section className="learning-signal">
      <Sparkles size={17} />
      <span>Ranking improves from employer selections, rejections, and challenge outcomes.</span>
    </section>
  );
}

function CvVsSkillIdentityPanel() {
  return (
    <section className="cv-proof-panel">
      <h3>Which one would you trust?</h3>
      <div>
        <article>
          <span>CV / self-claimed skills</span>
          <p>“React, APIs, dashboards, hardworking.”</p>
        </article>
        <article>
          <span>Proof-based skill identity</span>
          <p>Verified badge, evidence links, skill reliability, integrity risk, and semantic job match.</p>
        </article>
      </div>
    </section>
  );
}

function TalentIndexCard({ candidate, rank, hasActiveJob }) {
  const topSkills = [...(candidate.skills || [])]
    .sort((a, b) => Number(b.proofStrength || b.score || 0) - Number(a.proofStrength || a.score || 0))
    .slice(0, 3);
  const risk = candidate.integrityRisk || "medium";
  const matchScore = candidate.matchScore;
  const ruleScore = candidate.ruleMatchScore ?? candidate.decisionTrace?.ruleMatchScore ?? candidate.decisionTrace?.scoreComponents?.ruleMatch?.score;
  const semanticScore = candidate.semanticScore ?? candidate.semanticMatchScore ?? candidate.embeddingSimilarity ?? candidate.decisionTrace?.semanticScore;
  const isDemo = (candidate.badges || []).some((badge) => badge.evaluatorSource === "seed" || badge.evaluatorSource === "mock") ||
    String(candidate.liveUrl || "").includes(".example.com");

  return (
    <article className="talent-index-card">
      <div className="talent-index-rank">#{rank}</div>
      <div className="talent-index-main">
        <div className="talent-index-title">
          <div>
            <h3>{candidate.name}</h3>
            <p>{candidate.country || "Country unknown"}</p>
          </div>
          {isDemo && <span className="demo-profile-pill">Simulated/demo</span>}
          <span className={`integrity-tier-pill tier-${risk === "low" ? "low_risk" : risk === "high" ? "high_risk" : "medium_risk"}`}>
            {risk} integrity
          </span>
        </div>
        <div className="candidate-proof-links">
          {topSkills.map((skill) => (
            <span key={`${candidate.id}-${skill.skill}`}>{skill.skill}: {Math.round(skill.score || skill.proofStrength || 0)}%</span>
          ))}
          {!topSkills.length && <span>No evaluated skills yet</span>}
        </div>
        <SkillProofStrengthList skills={topSkills} compact />
      </div>
      <div className="talent-index-metrics">
        <Metric label="Reliability" value={`${Math.round(candidate.proofStrength || 0)}%`} />
        <Metric label="Rule Match" value={ruleScore != null ? `${Math.round(ruleScore)}%` : "—"} />
        <Metric label="Semantic" value={semanticScore != null ? `${Math.round(semanticScore)}%` : "—"} />
        <Metric label="Integrity" value={risk} />
        <Metric label="Match" value={hasActiveJob && matchScore != null ? `${Math.round(matchScore)}%` : "—"} />
      </div>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getSkillProofScore(skill) {
  return Math.round(Number(skill.score ?? skill.proofStrength ?? 0));
}

function getSkillProofLabel(skill) {
  const score = getSkillProofScore(skill);
  return skill.proofStrengthLabel || skill.label || (score >= 75 ? "Verified Strong" : score >= 55 ? "Strong" : score >= 35 ? "Moderate" : "Weak");
}

function getSkillSupportingProjects(skill) {
  return Number(skill.supportingProjects || skill.supporting_projects || skill.projectCount || 1);
}

function getSkillStrongestEvidence(skill) {
  return skill.strongestEvidence || skill.strongest_evidence || skill.evidence || "Evidence recorded in submitted project.";
}

function SkillProofStrengthList({ skills = [], compact = false }) {
  const rows = [...skills]
    .filter((skill) => skill?.skill)
    .sort((a, b) => getSkillProofScore(b) - getSkillProofScore(a))
    .slice(0, compact ? 3 : 8);
  if (!rows.length) return null;

  return (
    <div className={`skill-proof-list ${compact ? "skill-proof-list--compact" : ""}`}>
      {rows.map((skill) => {
        const score = getSkillProofScore(skill);
        return (
          <div className="skill-proof-row" key={`${skill.skill}-${score}`}>
            <div className="skill-proof-top">
              <strong>{skill.skill}</strong>
              <span>{score}% · {getSkillProofLabel(skill)} · {getSkillSupportingProjects(skill)} project{getSkillSupportingProjects(skill) !== 1 ? "s" : ""}</span>
            </div>
            <div className="skill-proof-track" aria-label={`${skill.skill} skill reliability ${score}%`}>
              <span style={{ width: `${Math.max(1, Math.min(100, score))}%` }} />
            </div>
            {!compact && (
              <p>
                {getSkillSupportingProjects(skill)} supporting project{getSkillSupportingProjects(skill) !== 1 ? "s" : ""} ·
                strongest evidence: {getSkillStrongestEvidence(skill)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderCandidateCard(candidate, selectedCandidate, setSelectedCandidate, compareNames, toggleCompare, setSelectedBadgeProof, evaluation) {
  const proofLinks = getDemoProofLinks(candidate);
  return (
    <article
      className={`candidate ${selectedCandidate?.name === candidate.name ? "selected" : ""} ${candidate.belowThreshold ? "below-threshold" : ""}`}
      key={candidate.name}
      onClick={() => setSelectedCandidate(candidate)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedCandidate(candidate); }}
    >
      <div>
        <h3>
          {candidate.name}
          {candidate.isDemoProfile && (
            <span className="demo-profile-pill" title="This profile was seeded for demo purposes and has not been live-evaluated">Demo profile</span>
          )}
        </h3>
        <p>{candidate.country} — {candidate.proof || candidate.headline || "Verified work"}</p>
        <div className="candidate-match-scoreline">
          <span>Final Match Score</span>
          <strong>{candidate.weightedMatchScore ?? candidate.match}%</strong>
        </div>
        {proofLinks && (proofLinks.githubUrl || proofLinks.liveUrl) && (
          <div className="candidate-proof-links" onClick={(e) => e.stopPropagation()}>
            {proofLinks.githubUrl && (
              <a href={proofLinks.githubUrl} target="_blank" rel="noreferrer" onKeyDown={(e) => e.stopPropagation()}>
                <ExternalLink size={14} /> GitHub
              </a>
            )}
            {proofLinks.liveUrl && (
              <a href={proofLinks.liveUrl} target="_blank" rel="noreferrer" onKeyDown={(e) => e.stopPropagation()}>
                <ExternalLink size={14} /> Live demo
              </a>
            )}
          </div>
        )}
        {candidate.proofStrength != null && (
          <div className="proof-strength-bar">
            <span>Skill Reliability</span>
            <div className="ps-track">
              <span style={{ width: `${candidate.proofStrength}%`, background: candidate.proofStrength >= 70 ? "#1d5f53" : candidate.proofStrength >= 45 ? "#b09042" : "#b05842" }} />
            </div>
            <strong>{candidate.proofStrength}/100</strong>
          </div>
        )}
        <SkillProofStrengthList skills={candidate.skills || []} compact />
        <label className="compare-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={compareNames.includes(candidate.name)} onChange={() => toggleCompare(candidate.name)} />
          Compare
        </label>
        <div className="mini-badges">
          <span className="mini-badges-label">Verified badges</span>
          {(candidate.badges || []).map((badge) => (
            <button key={badge} type="button" onClick={(e) => { e.stopPropagation(); setSelectedBadgeProof(createCandidateBadgeProof(candidate, badge, evaluation)); }}>
              {badge}
            </button>
          ))}
        </div>
        {candidate.matchExplanation && (
          <div className="match-details">
            <div className={`decision-banner ${candidate.hiringDecision?.recommendationKey || "borderline"}`}>
              <strong>{candidate.hiringDecision?.recommendation}</strong>
              <span>{candidate.hiringDecision?.confidence}% confidence</span>
            </div>
            <p><strong>Why this candidate:</strong> {candidate.matchExplanation}</p>

            {/* ── Hybrid score breakdown ────────────────────────────────── */}
            {candidate.decisionTrace?.scoreComponents && (
              <div className="score-breakdown-grid">
                {Object.entries(candidate.decisionTrace.scoreComponents).map(([key, comp]) => (
                  <div className="score-breakdown-row" key={key}>
                    <span className="sbd-label">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</span>
                    <div className="sbd-bar-track">
                      <span className="sbd-bar-fill" style={{ width: `${Math.min(100, comp.score || 0)}%` }} />
                    </div>
                    <span className="sbd-score">{Math.round(comp.score || 0)}</span>
                    {comp.source === "fallback_neutral" && <span className="sbd-note">no embed</span>}
                    {comp.source === "openai" && <span className="sbd-note ok">semantic</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="match-metrics">
              <span>{candidate.skillOverlapScore}% must-have</span>
              <span>{candidate.weightedMatchScore}% final</span>
              {candidate.ruleMatchScore != null && <span>{candidate.ruleMatchScore}% rule</span>}
              {candidate.embeddingSimilarity != null && (
                <span title="OpenAI text-embedding-3-small cosine similarity">
                  {candidate.embeddingSimilarity}% semantic
                </span>
              )}
              {(candidate.proofStrength ?? candidate.aggregatedProofStrength) != null && (
                <span>
                  {candidate.proofStrength ?? candidate.aggregatedProofStrength}/100 reliability
                  {candidate.proofStrengthTrend && candidate.proofStrengthTrend !== "single" && (
                    <span className={`trend-badge trend-${candidate.proofStrengthTrend}`}>
                      {candidate.proofStrengthTrend === "improving" ? "↑" : candidate.proofStrengthTrend === "declining" ? "↓" : "→"}
                    </span>
                  )}
                </span>
              )}
            </div>
            {(candidate.semanticExplanation || candidate.explainableMatch?.semanticExplanation) && (
              <p><strong>Semantic similarity:</strong> {candidate.semanticExplanation || candidate.explainableMatch.semanticExplanation}</p>
            )}

            {/* ── Integrity tier ────────────────────────────────────────── */}
            {candidate.integrityTier && (
              <div className={`integrity-tier-pill tier-${candidate.integrityTier}`}>
                {candidate.integrityTier === "low_risk" ? "✓ Low integrity risk" :
                 candidate.integrityTier === "medium_risk" ? "⚠ Medium integrity risk" :
                 "✗ High integrity risk — review before ranking"}
              </div>
            )}

            {/* ── Negative evidence flags ───────────────────────────────── */}
            {candidate.negativeEvidence?.flags?.length > 0 && (
              <div className="match-section neg-evidence">
                <strong>Negative evidence ({candidate.negativeEvidence.flags.length} signal{candidate.negativeEvidence.flags.length > 1 ? "s" : ""})</strong>
                <ul>
                  {candidate.negativeEvidence.flags.slice(0, 3).map((f) => (
                    <li key={f.signal} className={`neg-flag neg-flag-${f.severity}`}>
                      <span className="neg-flag-sev">{f.severity}</span> {f.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(candidate.strongMatches || []).length > 0 && (
              <div className="match-section">
                <strong>Strong matches</strong>
                <div className="match-chip-row">{candidate.strongMatches.map((s) => <span key={s}>{s}</span>)}</div>
              </div>
            )}
            {(candidate.missingSkills || []).length > 0 && (
              <div className="match-section">
                <strong>Missing skills / gaps</strong>
                <p className="missing">{candidate.missingSkills.join(", ")}</p>
              </div>
            )}
            {(candidate.hiringDecision?.riskAnalysis || []).length > 0 && (
              <div className="match-section">
                <strong>Risks</strong>
                <p className="missing">{candidate.hiringDecision.riskAnalysis.join(" ")}</p>
              </div>
            )}
            <div className="match-section">
              <strong>Next step</strong>
              <p>{candidate.hiringDecision?.nextStep}</p>
            </div>
            <GrowthPathMini growthPath={candidate.growthPath} />
          </div>
        )}
      </div>
      <strong className={candidate.belowThreshold ? "score-dim" : ""}>{candidate.weightedMatchScore || candidate.match}%</strong>
    </article>
  );
}

function MarketInsightPanel({ candidates, parsedJob }) {
  const insight = buildMarketInsight(candidates, parsedJob);

  return (
    <section className="market-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Globe2 size={16} /> Market Insight</p>
          <h2>{insight.rarityLabel}</h2>
        </div>
        <span className={`market-signal ${insight.signalKey}`}>{insight.supplyDemandSignal}</span>
      </div>

      <p>{insight.summary}</p>
      {insight.poolSize > 0 && insight.poolSize <= 20 && (
        <p className="market-sample-note">Note: pool size is {insight.poolSize} candidate{insight.poolSize !== 1 ? "s" : ""} — results are directional, not statistically significant.</p>
      )}

      <div className="market-stats">
        <article>
          <strong>{insight.averageMatch}%</strong>
          <span>average match</span>
        </article>
        <article>
          <strong>{insight.coreQualified}/{insight.poolSize}</strong>
          <span>meet core requirements</span>
        </article>
        <article>
          <strong>{insight.rareSkillCount}</strong>
          <span>hard-to-find skills</span>
        </article>
      </div>

      <div className="market-skills">
        {insight.rareSkills.map((skill) => <span key={skill}>{skill}</span>)}
      </div>
    </section>
  );
}

function JobDepthPanel({ parsedJob }) {
  if (!conforms(JobParsingSchema, parsedJob)) return null;

  return (
    <section className="deep-panel job-depth">
      <p className="eyebrow"><BriefcaseBusiness size={16} /> Job Parsing Engine</p>
      <h3>{parsedJob.business_context}</h3>
      <div className="deep-grid">
        <FactList title="Must-have" items={parsedJob.must_have || parsedJob.required_skills} />
        <FactList title="Nice-to-have" items={parsedJob.nice_to_have || parsedJob.nice_to_have_skills} />
        <FactList title="Technical skills" items={parsedJob.technical_skills} />
        <FactList title="Soft/contextual skills" items={parsedJob.soft_contextual_skills} />
        <FactList title="Ambiguity questions" items={parsedJob.ambiguity_questions} />
        <FactList title="Missing info" items={parsedJob.uncertainty?.missing} />
      </div>
    </section>
  );
}

function buildMarketInsight(candidates, parsedJob) {
  const poolSize = candidates.length;
  const averageMatch = poolSize
    ? Math.round(candidates.reduce((sum, candidate) => sum + candidate.weightedMatchScore, 0) / poolSize)
    : 0;
  const coreQualified = candidates.filter((candidate) => candidate.weightedMatchScore >= 75 && candidate.skillOverlapScore >= 60).length;
  const coverageBySkill = (parsedJob.required_skills || []).map((skill) => ({
    skill,
    count: candidates.filter((candidate) => candidate.matchedSkills?.includes(skill)).length
  }));
  const rareSkills = coverageBySkill.filter((item) => item.count <= Math.max(1, Math.floor(poolSize / 3))).map((item) => item.skill);
  const qualifiedRatio = poolSize ? coreQualified / poolSize : 0;
  const rarityLabel = qualifiedRatio >= 0.67
    ? "Common skill mix"
    : qualifiedRatio >= 0.34
      ? "Moderately scarce skill mix"
      : "Rare skill combination";
  const supplyDemandSignal = qualifiedRatio >= 0.67
    ? "Healthy supply"
    : qualifiedRatio >= 0.34
      ? "Tight supply"
      : "High demand / low supply";
  const signalKey = qualifiedRatio >= 0.67 ? "healthy" : qualifiedRatio >= 0.34 ? "tight" : "scarce";

  return {
    poolSize,
    averageMatch,
    coreQualified,
    rareSkills,
    rareSkillCount: rareSkills.length,
    rarityLabel,
    supplyDemandSignal,
    signalKey,
    summary: `${rarityLabel}. ${coreQualified} out of ${poolSize} candidates meet the core requirements for ${parsedJob.role_title}. Average match is ${averageMatch}%, with the tightest supply around ${rareSkills.slice(0, 3).join(", ") || "the parsed required skills"}.`
  };
}

function CompareCandidatesPanel({ candidates, parsedJob, allCandidates }) {
  if (!parsedJob || candidates.length < 2) {
    return (
      <section className="compare-panel">
        <p className="eyebrow"><ShieldCheck size={16} /> Compare Candidates</p>
        <p>Select two candidates to compare their proof side by side.</p>
      </section>
    );
  }

  const [first, second] = candidates;
  const firstProfile = getCandidateProfile(first.name, null, allCandidates);
  const secondProfile = getCandidateProfile(second.name, null, allCandidates);
  const firstGraph = getComparisonGraph(firstProfile);
  const secondGraph = getComparisonGraph(secondProfile);
  const recommendation = buildComparisonRecommendation(first, second, firstGraph, secondGraph, parsedJob);

  return (
    <section className="compare-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow"><ShieldCheck size={16} /> Compare Candidates</p>
          <h2>{first.name} vs {second.name}</h2>
        </div>
        <span className="api-pill">Decision view</span>
      </div>

      <div className="recommendation">
        <h3>Recommendation</h3>
        <p>{recommendation}</p>
      </div>

      <div className="compare-grid">
        {[first, second].map((candidate) => {
          const profile = getCandidateProfile(candidate.name, null, allCandidates);
          const graph = getComparisonGraph(profile);
          return (
            <article className="compare-card" key={candidate.name}>
              <div className="compare-card-head">
                <div>
                  <h3>{candidate.name}</h3>
                  <p>{candidate.country} - {candidate.weightedMatchScore}% match</p>
                </div>
                <strong>{candidate.skillOverlapScore}%</strong>
              </div>

              <div className={`decision-banner ${candidate.hiringDecision.recommendationKey}`}>
                <strong>{candidate.hiringDecision.recommendation}</strong>
                <span>{candidate.hiringDecision.confidence}% confidence</span>
              </div>

              <div className="compare-bars">
                {graph.map((item) => (
                  <div className="compare-bar" key={item.category}>
                    <div>
                      <span>{item.category}</span>
                      <strong>{item.score}%</strong>
                    </div>
                    <div><span style={{ width: `${item.score}%` }}></span></div>
                  </div>
                ))}
              </div>

              <div className="compare-section">
                <h4>Strong matches</h4>
                <div className="match-chip-row">
                  {candidate.strongMatches.map((skill) => <span key={skill}>{skill}</span>)}
                </div>
              </div>

              <div className="compare-section">
                <h4>Missing skills</h4>
                <p>{candidate.missingSkills.length ? candidate.missingSkills.join(", ") : "No major missing skill in the parsed requirements."}</p>
              </div>

              <div className="compare-section">
                <h4>Strengths</h4>
                <ul>{getCandidateStrengths(candidate, profile).map((item) => <li key={item}>{item}</li>)}</ul>
              </div>

              <div className="compare-section">
                <h4>Weaknesses</h4>
                <ul>{getCandidateWeaknesses(candidate).map((item) => <li key={item}>{item}</li>)}</ul>
              </div>

              <div className="compare-section">
                <h4>Hiring decision</h4>
                <p>{candidate.hiringDecision.justification}</p>
                <p><strong>Next:</strong> {candidate.hiringDecision.nextStep}</p>
              </div>

              <div className="compare-section">
                <h4>Growth Path</h4>
                <ul>{candidate.growthPath.nextSteps.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Build a display profile from the backend match candidate object
function getCandidateProfile(name, activeEvaluation, allCandidates) {
  if (activeEvaluation && name === activeEvaluation.candidateName) return activeEvaluation;
  const c = (allCandidates || []).find((x) => x.name === name);
  if (!c) return null;
  return {
    skillScores: (c.strongMatches || []).map((s) => ({
      skill: s, score: Math.round((c.weightedMatchScore || 60) * 0.9), evidence: `Matched: ${s}`
    })),
    earnedBadges: c.earnedBadges || [],
    proofAnalysis: {
      skill_graph: null,
      confidence_score: c.weightedMatchScore || 0,
      proof_strength: c.proofStrength || 0
    },
    strengths: (c.strongMatches || []).slice(0, 2).map((s) => `Verified match for ${s}.`),
    isDemoProfile: c.isDemoProfile || false
  };
}

function getComparisonGraph(profile) {
  if (profile?.proofAnalysis?.skill_graph) {
    return profile.proofAnalysis.skill_graph;
  }
  return buildLocalSkillGraph(profile?.skillScores || []);
}

function buildLocalSkillGraph(skillScores) {
  const categories = ["UI/Frontend", "Backend/API", "Data Handling", "System Design"];
  return categories.map((category) => {
    const skills = skillScores.filter((skill) => categorizeSkill(skill.skill) === category);
    return {
      category,
      score: skills.length ? Math.round(skills.reduce((sum, skill) => sum + Number(skill.score || 0), 0) / skills.length) : 0,
      skills: skills.map((skill) => skill.skill)
    };
  });
}

function categorizeSkill(skill) {
  const label = String(skill).toLowerCase();
  if (label.includes("api") || label.includes("backend") || label.includes("integration")) return "Backend/API";
  if (label.includes("data") || label.includes("transaction") || label.includes("table")) return "Data Handling";
  if (label.includes("structure") || label.includes("deployment") || label.includes("component")) return "System Design";
  return "UI/Frontend";
}

function buildComparisonRecommendation(first, second, firstGraph, secondGraph, parsedJob) {
  const firstBest = topCategory(firstGraph);
  const secondBest = topCategory(secondGraph);
  const winner = first.weightedMatchScore >= second.weightedMatchScore ? first : second;
  const other = winner.name === first.name ? second : first;
  const gap = Math.abs(first.weightedMatchScore - second.weightedMatchScore);
  const role = parsedJob.role_title || "this role";

  if (gap < 6) {
    return `${first.name} and ${second.name} are close for ${role}. ${first.name} is stronger in ${firstBest.category}, while ${second.name} is stronger in ${secondBest.category}. Use the final challenge to test the missing skills before choosing.`;
  }

  return `${winner.name} is the stronger recommendation for ${role} because their verified proof maps more closely to the required skills. ${first.name} is strongest in ${firstBest.category}, while ${second.name} is strongest in ${secondBest.category}. ${other.name} may still be useful if the role leans more toward ${secondBest.category}.`;
}

function topCategory(graph) {
  return [...graph].sort((a, b) => b.score - a.score)[0] || { category: "general delivery", score: 0 };
}

function getCandidateStrengths(candidate, profile) {
  const proofStrengths = profile?.strengths || [];
  return [
    ...candidate.strongMatches.slice(0, 2).map((skill) => `Verified match for ${skill}.`),
    ...proofStrengths.slice(0, 2)
  ].slice(0, 4);
}

function getCandidateWeaknesses(candidate) {
  if (candidate.missingSkills.length) {
    return candidate.missingSkills.slice(0, 3).map((skill) => `Needs stronger proof for ${skill}.`);
  }
  return ["No major missing skill from the parsed requirements; final challenge should test depth."];
}

function GrowthPathMini({ growthPath }) {
  if (!growthPath) return null;

  return (
    <div className="growth-path">
      <strong>Growth Path</strong>
      <p>{growthPath.summary}</p>
      <div className="growth-columns">
        <div>
          <span>Needs</span>
          <ul>{growthPath.missingSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
        </div>
        <div>
          <span>Suggested next steps</span>
          <ul>{growthPath.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

function ExecutionFlow({ jobId, companyId, parsedJob, selectedCandidate, challengeSent, setChallengeSent, paid, setPaid }) {
  const [generatedChallenge, setGeneratedChallenge] = useState(null);
  const [generatingChallenge, setGeneratingChallenge] = useState(false);
  const finalChallengeText =
    generatedChallenge?.challenge_title
    || parsedJob?.test_challenge
    || "Build a transaction dashboard with filters, API-backed data, and receipt download.";
  const talentPk = selectedCandidate?.talentId || selectedCandidate?.id;

  async function generateChallenge() {
    if (!parsedJob) return;
    setGeneratingChallenge(true);
    try {
      const data = await fetchJson(`${API_BASE}/generate-challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedJob,
          missingSkills: selectedCandidate?.missingSkills || [],
          candidateName: selectedCandidate?.name || ""
        })
      });
      setGeneratedChallenge(data);
    } catch (e) {
      // non-blocking — fallback to test_challenge text
    } finally {
      setGeneratingChallenge(false);
    }
  }

  async function sendFinalChallenge() {
    if (jobId && talentPk && companyId) {
      try {
        await fetch(`${API_BASE}/final-challenges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            talentId: talentPk,
            challengeText: finalChallengeText,
            status: "sent"
          })
        });
      } catch {
        // non-blocking for demo
      }
    }
    setChallengeSent(true);
  }

  async function recordPayment() {
    if (companyId && talentPk) {
      try {
        await fetch(`${API_BASE}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            talentId: talentPk,
            amount: 1,
            status: "demo_linked",
            payoutMethod: "mobile_money"
          })
        });
      } catch {
        // non-blocking
      }
    }
    if (DEMO_PAYMENT_URL) {
      window.open(DEMO_PAYMENT_URL, "_blank", "noopener,noreferrer");
    }
    setPaid(true);
  }

  return (
    <div className="execution-grid execution-grid--employer">
      <div className="workspace workspace--employer">
        <div className="section-head">
          <div>
            <p className="eyebrow"><Layers3 size={16} /> Mini hackathon</p>
            <h2>Invite candidates to a company challenge</h2>
            <p className="section-sub">Selected talent receives: company, task, deadline, expected output, and role context — then you compare ranked submissions.</p>
          </div>
          <div className="section-head-actions">
            <button type="button" className="secondary" onClick={() => window.alert("Demo: notify all shortlisted candidates in one batch.")}>
              <Users size={18} /> Notify shortlist
            </button>
            <button type="button" className="secondary" onClick={generateChallenge} disabled={generatingChallenge || !parsedJob}>
              {generatingChallenge ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {generatingChallenge ? "Generating…" : generatedChallenge ? "Regenerate challenge" : "Generate AI challenge"}
            </button>
            <button className="primary" type="button" onClick={sendFinalChallenge}>
              <FileCheck2 size={18} /> Send company challenge
            </button>
          </div>
        </div>

        <div className="notify-callout" role="status">
          <strong>Candidate notification (copy)</strong>
          <p>“You have been invited to a company challenge.” — includes company name, task, deadline, expected output, and potential role or payment band.</p>
        </div>

        <div className="final-challenge">
          <div className="icon-box"><Filter size={22} /></div>
          <div>
            <h3>{finalChallengeText}</h3>
            <p>
              {parsedJob?.role_title ? `For ${parsedJob.role_title}. ` : ""}
              {generatedChallenge ? `AI-generated (${generatedChallenge.source}) from parsed job and candidate gaps. ` : ""}
              Sent to {selectedCandidate.name} for ranked review alongside other invitees.
            </p>
            {generatedChallenge && (
              <div className="generated-challenge-detail">
                {generatedChallenge.deliverables?.length > 0 && (
                  <p><strong>Deliverables:</strong> {generatedChallenge.deliverables.join(" · ")}</p>
                )}
                {generatedChallenge.acceptance_criteria?.length > 0 && (
                  <p><strong>Acceptance:</strong> {generatedChallenge.acceptance_criteria.slice(0, 2).join(" · ")}</p>
                )}
                <p><strong>Time limit:</strong> {generatedChallenge.time_limit_minutes} min · <strong>Evidence required:</strong> {(generatedChallenge.evidence_required || []).join(", ")}</p>
              </div>
            )}
          </div>
        </div>

        {challengeSent && (
          <>
            <div className="chat">
              <div className="message company">We liked your verified proof. Please complete this company challenge: {finalChallengeText.slice(0, 120)}{finalChallengeText.length > 120 ? "…" : ""}</div>
              <div className="message talent">Accepted. I will submit the artifact, repo link, and notes before the deadline.</div>
            </div>
            <section className="ranked-submissions">
              <p className="eyebrow"><Target size={14} /> Employer view</p>
              <h3>Ranked final submissions (demo)</h3>
              <ol className="ranked-list">
                <li><strong>{selectedCandidate.name}</strong> — strongest alignment to must-have skills; complete proof package.</li>
                <li><strong>Bench candidate B</strong> — solid delivery; gaps on edge-case handling.</li>
                <li><strong>Bench candidate C</strong> — promising; needs follow-up on API depth.</li>
              </ol>
            </section>
          </>
        )}
      </div>

      <aside className="payment">
        <p className="eyebrow"><WalletCards size={16} /> Payment rail</p>
        <h2>Hire {selectedCandidate.name}</h2>
        <div className="pay-route">
          <span><CircleDollarSign size={18} /> Employer card</span>
          <ArrowRight size={18} />
          <span><Banknote size={18} /> Mobile money</span>
        </div>
        <button
          className={paid ? "success" : "primary"}
          type="button"
          onClick={recordPayment}
        >
          {paid ? <Check size={18} /> : <Banknote size={18} />}
          {paid ? "Payment Linked" : "Generate Payment Link"}
        </button>
        <p>
          {DEMO_PAYMENT_URL
            ? "Opens your configured payment URL in a new tab (set VITE_DEMO_PAYMENT_URL), then marks the link as generated."
            : "Supports the demo narrative for cross-border execution. Set VITE_DEMO_PAYMENT_URL to a real checkout or wallet link to open it here."}
        </p>
      </aside>
    </div>
  );
}

function Step({ done, icon, title, text }) {
  return (
    <div className={`step ${done ? "done" : ""}`}>
      <span>{done ? <Check size={18} /> : icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

function ScoreCard({ proofScore, evaluation, currentUser }) {
  const name = currentUser?.name || evaluation?.candidateName || "Candidate";
  const country = currentUser?.country || "—";
  return (
    <div className="score-card">
      <div>
        <p className="eyebrow"><BadgeCheck size={16} /> Verified profile</p>
        <h2>{name}</h2>
        <p>{country} · {evaluation.source} evaluation</p>
      </div>
      <strong>{proofScore}%</strong>
    </div>
  );
}

function BadgeProofModal({ proof, onClose }) {
  return (
    <div className="proof-backdrop" role="presentation" onClick={onClose}>
      <section className="proof-modal" role="dialog" aria-modal="true" aria-label={`${proof.title} proof`} onClick={(event) => event.stopPropagation()}>
        <div className="proof-head">
          <div>
            <p className="eyebrow"><BadgeCheck size={16} /> Evidence-backed badge</p>
            <h2>{proof.title}</h2>
            <p>{proof.candidateName} - {proof.score}% verified</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close badge proof">
            <X size={20} />
          </button>
        </div>

        <div className="proof-grid">
          <article className="proof-section">
            <h3>Original challenge</h3>
            <p>{proof.originalChallenge}</p>
          </article>
          <article className="proof-section">
            <h3>Candidate submission</h3>
            <p>{proof.submissionTitle}</p>
            <p>{proof.submissionSummary}</p>
          </article>
        </div>

        <article className="proof-section">
          <h3>Why this badge was awarded</h3>
          <p>{proof.awardReason}</p>
        </article>

        <article className="proof-section">
          <h3>Backend verification provenance</h3>
          <div className="checklist">
            <div className={proof.backendProvenance.repoVerified ? "checklist-item ok" : "checklist-item"}>
              <Check size={16} />
              <span>GitHub evidence source</span>
              <strong>{proof.backendProvenance.githubEvidenceSource}</strong>
            </div>
            <div className={proof.backendProvenance.liveDemoReachable ? "checklist-item ok" : "checklist-item"}>
              <Check size={16} />
              <span>Live demo reachable</span>
              <strong>{proof.backendProvenance.liveDemoReachable ? "yes" : "no"}</strong>
            </div>
            <div className={proof.backendProvenance.liveDemoInspected ? "checklist-item ok" : "checklist-item"}>
              <Check size={16} />
              <span>Playwright runtime inspected</span>
              <strong>{proof.backendProvenance.liveDemoInspected ? "yes" : "no"}</strong>
            </div>
            <div className={proof.backendProvenance.apiSignalDetected ? "checklist-item ok" : "checklist-item"}>
              <Check size={16} />
              <span>API code/runtime signal</span>
              <strong>{proof.backendProvenance.apiSignalDetected ? "detected" : "missing"}</strong>
            </div>
            <div className={proof.backendProvenance.verificationTestStatus === "passed" ? "checklist-item ok" : "checklist-item"}>
              <Check size={16} />
              <span>Targeted test status</span>
              <strong>
                {proof.backendProvenance.verificationTestStatus}
                {proof.backendProvenance.verificationTestScore != null ? ` (${Math.round(proof.backendProvenance.verificationTestScore)}%)` : ""}
              </strong>
            </div>
            <div className="checklist-item ok">
              <Check size={16} />
              <span>Evaluator source</span>
              <strong>{proof.backendProvenance.evaluatorSource}</strong>
            </div>
          </div>
        </article>

        <article className="proof-section">
          <h3>Verification timeline</h3>
          <div className="timeline-list">
            {proof.verificationTimeline.map((item) => (
              <div className="timeline-item" key={item.label}>
                <span></span>
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <div className="proof-grid">
          <article className="proof-section">
            <h3>Evidence checklist</h3>
            <div className="checklist">
              {proof.evidenceChecklist.map((item) => (
                <div className={item.ok ? "checklist-item ok" : "checklist-item"} key={item.label}>
                  <Check size={16} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="proof-section">
            <h3>Integrity risk</h3>
            <div className={`risk-card ${proof.integrityRisk.level}`}>
              <strong>{proof.integrityRisk.level} risk</strong>
              <p>{proof.integrityRisk.reason}</p>
            </div>
          </article>
        </div>

        <article className="proof-section employer-trust">
          <h3>Why should I trust this badge?</h3>
          <p>{proof.employerTrust}</p>
          <div className="trust-facts">
            <span>Rubric: observable output only</span>
            <span>Confidence: {proof.confidenceScore}%</span>
            <span>Risk: {proof.integrityRisk.level}</span>
          </div>
        </article>

        <article className="proof-section">
          <h3>AI evaluation explanation</h3>
          <p>{proof.evaluationExplanation}</p>
        </article>

        <article className="proof-section">
          <h3>Score breakdown</h3>
          <div className="breakdown-list">
            {proof.scoreBreakdown.map((item) => (
              <div className="breakdown-row" key={`${item.skill}-${item.score}`}>
                <div>
                  <strong>{item.skill}</strong>
                  <p>{item.evidence}</p>
                </div>
                <span>{Math.round(item.score)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="proof-section">
          <h3>Evidence links</h3>
          <div className="evidence-links">
            {proof.evidenceLinks.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> {link.label}
              </a>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function getAverageScore(evaluation) {
  const scores = evaluation?.skillScores || [];
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, skill) => sum + Number(skill.score || 0), 0) / scores.length);
}

function createCandidateBadgeProof(candidate, badgeTitle, activeEvaluation) {
  // For the logged-in user's own evaluation, use the live evaluation object
  if (activeEvaluation && candidate.name === activeEvaluation.candidateName) {
    return createBadgeProof(findBadgeForLabel(activeEvaluation, badgeTitle), activeEvaluation, aminaProofContext, badgeTitle);
  }

  // Build a proof object directly from the backend match candidate data
  const earnedBadges = candidate.earnedBadges || [];
  const matchedBadge = earnedBadges.find(
    (b) => normalizeForMatch(b.title).includes(normalizeForMatch(badgeTitle)) ||
           normalizeForMatch(badgeTitle).includes(normalizeForMatch(b.title))
  ) || { title: badgeTitle, score: 0, evidence: "Badge listed on candidate profile." };

  const isDemoProfile = candidate.isDemoProfile || earnedBadges.some((b) => b.evaluatorSource === "seed");
  const evidenceLinks = [
    candidate.githubUrl ? { label: "GitHub repository", href: candidate.githubUrl } : null,
    candidate.liveUrl ? { label: "Live demo", href: candidate.liveUrl } : null
  ].filter(Boolean);

  const proofContext = {
    candidateName: candidate.name,
    originalChallenge: candidate.proof || "Proof-of-work challenge",
    submissionTitle: candidate.proof || "Candidate submission",
    githubUrl: candidate.githubUrl || null,
    liveUrl: candidate.liveUrl || null,
    submissionSummary: candidate.proof || "Verified work sample."
  };

  // Build a synthetic profile from match data so createBadgeProof can render
  const syntheticProfile = {
    skillScores: (candidate.strongMatches || []).map((s) => ({
      skill: s, score: Math.round((candidate.weightedMatchScore || 60) * 0.9), evidence: `Matched against job requirement: ${s}`
    })),
    earnedBadges,
    evaluatorSource: isDemoProfile ? "seed" : (matchedBadge.evaluatorSource || "unknown"),
    source: isDemoProfile ? "seed" : "backend",
    evidenceExplanation: isDemoProfile
      ? "This candidate was seeded for demo purposes. Their badges were not awarded by a live evaluation of real submitted work."
      : "Badges were awarded by the backend Proof Engine after evaluating submitted proof.",
    employerSummary: isDemoProfile
      ? `Demo profile for ${candidate.name}. Run a real submission to see live-evaluated badges.`
      : `${candidate.name} — backend-matched candidate. ${candidate.matchExplanation || ""}`,
    githubEvidence: { source: isDemoProfile ? "seeded" : "unknown" },
    proofAnalysis: {
      confidence_score: isDemoProfile ? 0 : (candidate.weightedMatchScore || 0),
      proof_strength: candidate.proofStrength || 0,
      live_demo_analysis: null,
      static_signals: null,
      artifact_summary: { live_url_reachable: Boolean(candidate.liveUrl) }
    }
  };

  return createBadgeProof(matchedBadge, syntheticProfile, proofContext, badgeTitle);
}

function createBadgeProof(badge, profile, proofContext, fallbackTitle = "") {
  const scoreBreakdown = getRelevantScoreBreakdown(badge, profile);
  const strongestEvidence = scoreBreakdown[0]?.evidence || badge?.evidence || "No backend evidence available.";
  const confidenceScore = Math.round(Number(profile?.proofAnalysis?.confidence_score || badge?.score || getAverageScore(profile)));
  const normalizedBadgeSkill = String((badge?.title || fallbackTitle || "").replace(/^Verified\s+/i, "")).toLowerCase();
  const verificationTest = (profile?.verificationTests || []).find(
    (test) => String(test.skillName || "").toLowerCase() === normalizedBadgeSkill
  );
  const evidenceLinks = [
    proofContext.githubUrl ? { label: "GitHub repository", href: proofContext.githubUrl } : null,
    proofContext.liveUrl ? { label: "Live demo", href: proofContext.liveUrl } : null,
    proofContext.videoUrl ? { label: "Walkthrough video", href: proofContext.videoUrl } : null
  ].filter(Boolean);
  const evidenceChecklist = buildEvidenceChecklist(profile, proofContext, confidenceScore);
  const integrityRisk = calculateIntegrityRisk(evidenceChecklist, confidenceScore);
  const backendProvenance = {
    evaluatorSource: profile?.evaluatorSource || profile?.source || "unknown",
    githubEvidenceSource: profile?.githubEvidence?.source || "unknown",
    repoVerified: profile?.githubEvidence?.source === "github",
    liveDemoInspected: Boolean(profile?.proofAnalysis?.live_demo_analysis?.inspected),
    liveDemoReachable: Boolean(profile?.proofAnalysis?.artifact_summary?.live_url_reachable),
    apiSignalDetected: Boolean(profile?.proofAnalysis?.static_signals?.api_usage_detected),
    badgeStage: badge?.badgeStage || "unknown",
    verificationTestStatus: verificationTest?.status || "unknown",
    verificationTestScore: verificationTest?.score ?? null
  };

  return {
    title: badge?.title || `Verified ${fallbackTitle}`,
    candidateName: proofContext.candidateName,
    score: Math.round(Number(badge?.score || scoreBreakdown[0]?.score || getAverageScore(profile))),
    originalChallenge: proofContext.originalChallenge,
    submissionTitle: proofContext.submissionTitle,
    submissionSummary: proofContext.submissionSummary,
    evaluationExplanation: profile.evidenceExplanation || profile.employerSummary || "The evaluator reviewed the submitted work evidence and mapped observed behaviors to skills.",
    awardReason: `${badge?.title || fallbackTitle} was awarded because the submitted work contains observable evidence: ${badge?.evidence || strongestEvidence}. The badge is linked to the challenge, submission links, and skill-level scores rather than a self-declared claim.`,
    scoreBreakdown,
    evidenceLinks,
    confidenceScore,
    evidenceChecklist,
    integrityRisk,
    backendProvenance,
    verificationTimeline: buildVerificationTimeline(badge, profile, proofContext),
    employerTrust: buildEmployerTrustSummary(badge, profile, proofContext, integrityRisk, confidenceScore)
  };
}

function buildVerificationTimeline(badge, profile, proofContext) {
  const inferredSkills = profile?.proofAnalysis?.skills_inferred || profile?.skillScores?.map((skill) => skill.skill) || [];
  return [
    {
      label: "Challenge started",
      detail: proofContext.originalChallenge
    },
    {
      label: "Submission received",
      detail: `${proofContext.submissionTitle} with ${proofContext.githubUrl ? "GitHub proof" : "no GitHub proof"} and ${proofContext.liveUrl ? "live demo proof" : "no live demo proof"}.`
    },
    {
      label: "Proof Engine analyzed project",
      detail: profile?.proofAnalysis
        ? `Detected ${profile.proofAnalysis.project_type}, ${profile.proofAnalysis.complexity_level} complexity, and ${profile.proofAnalysis.confidence_score}% confidence.`
        : "Reviewed submitted explanation, badge evidence, and skill scores."
    },
    {
      label: "Skills inferred",
      detail: inferredSkills.slice(0, 5).join(", ") || "Skill evidence mapped from project output."
    },
    {
      label: "Badge awarded",
      detail: `${badge?.title || "Badge"} awarded with ${Math.round(Number(badge?.score || getAverageScore(profile)))}% verification score.`
    }
  ];
}

function buildEvidenceChecklist(profile, proofContext, confidenceScore) {
  const readmeDetected = Boolean(profile?.proofAnalysis?.github_readme_excerpt);
  const fileStructureDetected = Boolean(profile?.proofAnalysis?.file_structure?.length);
  return [
    { label: "Live demo provided", ok: Boolean(proofContext.liveUrl), value: proofContext.liveUrl ? "yes" : "missing" },
    { label: "GitHub link provided", ok: Boolean(proofContext.githubUrl), value: proofContext.githubUrl ? "yes" : "missing" },
    { label: "README detected", ok: readmeDetected, value: readmeDetected ? "detected" : "not found" },
    { label: "File structure detected", ok: fileStructureDetected, value: fileStructureDetected ? `${profile.proofAnalysis.file_structure.length} files` : "not found" },
    { label: "Explanation submitted", ok: Boolean(proofContext.submissionSummary), value: proofContext.submissionSummary ? "yes" : "missing" },
    { label: "AI confidence score", ok: confidenceScore >= 70, value: `${confidenceScore}%` }
  ];
}

function calculateIntegrityRisk(checklist, confidenceScore) {
  const missing = checklist.filter((item) => !item.ok).length;
  if (missing <= 1 && confidenceScore >= 80) {
    return {
      level: "low",
      reason: "Multiple independent evidence signals are present, including proof links, repository signals, explanation, and a high Proof Engine confidence score."
    };
  }
  if (missing <= 3 && confidenceScore >= 60) {
    return {
      level: "medium",
      reason: "The badge has enough evidence to review, but one or more proof signals are missing or confidence is not high enough for automatic trust."
    };
  }
  return {
    level: "high",
    reason: "The badge relies on limited evidence. An employer should request a timed follow-up challenge or manual review before trusting it."
  };
}

function buildEmployerTrustSummary(badge, profile, proofContext, integrityRisk, confidenceScore) {
  const rubric = profile?.proofAnalysis
    ? `The Proof Engine inspected the project type, detected features, repository signals, inferred skills, and confidence score.`
    : "The evaluator mapped the submitted work to skill scores and badge evidence.";
  return `${badge?.title || "This badge"} is trustable only if it is connected to a specific challenge, a candidate submission, evidence links, a score breakdown, and an integrity review. ${rubric} Current confidence is ${confidenceScore}% and integrity risk is ${integrityRisk.level}. Employers should still open the evidence links before making a final hiring decision.`;
}

function findBadgeForLabel(profile, label) {
  const normalizedLabel = normalizeForMatch(label);
  const earned = profile?.earnedBadges?.find((badge) => normalizeForMatch(badge.title).includes(normalizedLabel));
  if (earned) return earned;

  const skill = profile?.skillScores?.find((item) => {
    const normalizedSkill = normalizeForMatch(item.skill);
    return normalizedSkill.includes(normalizedLabel) || normalizedLabel.includes(normalizedSkill.split(" ")[0]);
  });

  if (skill) {
    return {
      title: `Verified ${skill.skill}`,
      score: skill.score,
      evidence: skill.evidence
    };
  }

  return {
    title: `Verified ${label}`,
    score: getAverageScore(profile),
    evidence: profile?.employerSummary || "This badge is connected to evaluated candidate work."
  };
}

function getRelevantScoreBreakdown(badge, profile) {
  const terms = tokenize(expandSkillTerms(`${badge?.title || ""} ${badge?.evidence || ""}`));
  const scores = profile?.skillScores || [];
  const ranked = scores
    .map((skill) => {
      const skillTerms = tokenize(expandSkillTerms(`${skill.skill} ${skill.evidence}`));
      const overlap = terms.filter((term) => skillTerms.includes(term)).length;
      return { ...skill, relevance: overlap };
    })
    .sort((a, b) => b.relevance - a.relevance || b.score - a.score);

  const relevant = ranked.filter((item) => item.relevance > 0).slice(0, 4);
  return (relevant.length ? relevant : ranked.slice(0, 3)).map((item) => ({
    skill: item.skill,
    score: item.score,
    evidence: item.evidence
  }));
}

function normalizeForMatch(value) {
  return String(value).toLowerCase().replace(/verified|builder|level|ui/g, "").replace(/[^a-z0-9\s]/g, " ").trim();
}

// Frontend-local matcher removed — all matching now done by POST /api/jobs/:id/match
// The functions below (matchCandidateToJob through normalizeWeights) are unused and
// can be deleted after the hackathon. tokenize/expandSkillTerms are still used by
// getRelevantScoreBreakdown and must remain.

function matchCandidateToJob(candidate, profile, parsedJob) {
  const requiredMatches = matchItems(parsedJob.required_skills, profile);
  const niceMatches = matchItems(parsedJob.nice_to_have_skills, profile);
  const deliverableMatches = matchItems(parsedJob.deliverables, profile);
  const weights = normalizeWeights(parsedJob.matching_weights);
  const proofQuality = getAverageScore(profile) / 100;
  const requiredRatio = getMatchRatio(requiredMatches);
  const niceRatio = getMatchRatio(niceMatches);
  const deliverableRatio = getMatchRatio(deliverableMatches);
  const weightedMatchScore = Math.round(100 * (
    requiredRatio * weights.required_skills +
    niceRatio * weights.nice_to_have_skills +
    deliverableRatio * weights.deliverables +
    proofQuality * weights.proof_quality
  ));
  const skillOverlapScore = Math.round(requiredRatio * 100);
  const matchedRequiredSkills = requiredMatches.filter((item) => item.matched).map((item) => item.label);
  const strongMatches = requiredMatches
    .filter((item) => item.matched && item.confidence >= 0.5)
    .map((item) => item.label);
  const missingSkills = requiredMatches.filter((item) => !item.matched).map((item) => item.label);
  const explainableMatch = buildExplainableMatch(requiredMatches, niceMatches, deliverableMatches, weightedMatchScore, profile);
  const growthPath = buildGrowthPath(candidate, missingSkills, parsedJob);
  const hiringDecision = buildHiringDecision({
    candidate,
    profile,
    parsedJob,
    weightedMatchScore,
    skillOverlapScore,
    strongMatches: strongMatches.length ? strongMatches : matchedRequiredSkills.slice(0, 3),
    missingSkills,
    proofQuality
  });

  return {
    ...candidate,
    match: weightedMatchScore,
    weightedMatchScore,
    skillOverlapScore,
    missingSkills,
    growthPath,
    strongMatches: strongMatches.length ? strongMatches : matchedRequiredSkills.slice(0, 3),
    matchedSkills: matchedRequiredSkills,
    hiringDecision,
    explainableMatch,
    matchExplanation: buildMatchExplanation(candidate, weightedMatchScore, strongMatches.length ? strongMatches : matchedRequiredSkills, missingSkills, profile, parsedJob)
  };
}

function buildExplainableMatch(requiredMatches, niceMatches, deliverableMatches, totalScore, profile) {
  const mustHaveCoverage = Math.round(getMatchRatio(requiredMatches) * 100);
  const niceToHaveCoverage = Math.round(getMatchRatio(niceMatches) * 100);
  const missingCritical = requiredMatches.filter((item) => !item.matched).map((item) => item.label);
  const evidenceBackedMatches = [...requiredMatches, ...niceMatches, ...deliverableMatches]
    .filter((item) => item.matched)
    .slice(0, 6)
    .map((item) => ({
      requirement: item.label,
      evidence: item.evidence || "Matched against evaluated skill/badge evidence."
    }));
  const uncertaintyPenalty = (profile?.uncertainty?.missing?.length || 0) * 5;
  const riskScore = Math.min(100, Math.max(0, missingCritical.length * 18 + uncertaintyPenalty + (100 - totalScore) * 0.35));
  const matchExplanation = {
    totalMatchScore: totalScore,
    mustHaveCoverage,
    niceToHaveCoverage,
    riskScore: Math.round(riskScore),
    missingCriticalRequirements: missingCritical,
    evidenceBackedMatches,
    recommendation: totalScore >= 80 && riskScore < 35
      ? "Proceed with high confidence, then verify remaining assumptions in a short final screen."
      : totalScore >= 60
        ? "Proceed with a targeted final challenge focused on missing critical requirements."
        : "Do not proceed unless the role requirements are relaxed or new proof is submitted."
  };
  return conforms(MatchExplanationSchema, matchExplanation)
    ? matchExplanation
    : {
      totalMatchScore: totalScore,
      mustHaveCoverage: 0,
      niceToHaveCoverage: 0,
      riskScore: 100,
      missingCriticalRequirements: [],
      evidenceBackedMatches: [],
      recommendation: "Schema validation failed for match explanation; send a manual review challenge."
    };
}

function buildGrowthPath(candidate, missingSkills, parsedJob) {
  const nextSteps = missingSkills.length
    ? missingSkills.slice(0, 4).map((skill) => suggestLearningStep(skill))
    : [
      `Complete a timed final challenge for ${parsedJob?.role_title || "this role"}.`,
      "Add a short technical walkthrough explaining architecture and tradeoffs."
    ];
  const projectStep = suggestProjectStep(missingSkills, parsedJob);
  const uniqueSteps = [...new Set([...nextSteps, projectStep])].filter(Boolean).slice(0, 5);

  return {
    summary: missingSkills.length
      ? `To fully match this role, ${candidate.name} should close ${missingSkills.length} gap${missingSkills.length > 1 ? "s" : ""} before direct hire.`
      : `${candidate.name} has no major parsed skill gap; growth should focus on depth and production readiness.`,
    missingSkills: missingSkills.length ? missingSkills : ["No major missing skill from parsed requirements"],
    nextSteps: uniqueSteps
  };
}

function suggestLearningStep(skill) {
  const label = skill.toLowerCase();
  if (label.includes("api") || label.includes("backend")) return "Complete an intermediate API integration challenge with loading, error, and retry states.";
  if (label.includes("data") || label.includes("transaction")) return "Build a dashboard project with filtering, sorting, and transaction detail views.";
  if (label.includes("form") || label.includes("validation")) return "Complete a form validation challenge with edge cases and accessible error states.";
  if (label.includes("mobile") || label.includes("responsive") || label.includes("ui")) return "Rebuild a responsive interface from a real product brief across mobile and desktop breakpoints.";
  if (label.includes("design") || label.includes("architecture") || label.includes("structure")) return "Document component architecture and state management decisions in a project README.";
  return `Complete a focused challenge proving ${skill}.`;
}

function suggestProjectStep(missingSkills, parsedJob) {
  const pj = parsedJob || {};
  const text = `${missingSkills.join(" ")} ${pj.test_challenge || ""}`.toLowerCase();
  if (text.includes("dashboard") || text.includes("transaction") || text.includes("data")) return "Build a dashboard project using realistic data and explain the data flow.";
  if (text.includes("api")) return "Extend an existing project with a real API-backed feature and documented fallback behavior.";
  if (text.includes("form")) return "Add a production-style form flow with validation, submission states, and confirmation screen.";
  return `Complete the generated final challenge: ${pj.test_challenge || "the scoped hiring challenge"}`;
}

function buildHiringDecision({ candidate, profile, parsedJob, weightedMatchScore, skillOverlapScore, strongMatches, missingSkills, proofQuality }) {
  const proofConfidence = Number(profile?.proofAnalysis?.confidence_score || Math.round(proofQuality * 100));
  const confidence = Math.round((weightedMatchScore * 0.5) + (skillOverlapScore * 0.3) + (proofConfidence * 0.2));
  const missingCoreCount = missingSkills.length;
  const recommendation = getHiringRecommendation(weightedMatchScore, skillOverlapScore, confidence, missingCoreCount);
  const recommendationKey = recommendation.toLowerCase().replaceAll(" ", "-");
  const nextStep = getSuggestedNextStep(recommendation, missingCoreCount);
  const proven = strongMatches.length ? strongMatches.join(", ") : "general project delivery";
  const projectAnalysis = profile?.proofAnalysis
    ? `${profile.proofAnalysis.project_type} at ${profile.proofAnalysis.complexity_level} complexity`
    : "verified project evidence";
  const role = parsedJob?.role_title || "this role";
  const riskAnalysis = buildDecisionRisks(missingSkills, profile, proofConfidence);

  return {
    recommendation,
    recommendationKey,
    confidence,
    justification: `${candidate.name} is rated ${recommendation} for ${role} because they have proven ${proven}. The project analysis shows ${projectAnalysis}, and the match engine found ${skillOverlapScore}% overlap with the required skills.`,
    riskAnalysis,
    nextStep
  };
}

function getHiringRecommendation(matchScore, overlapScore, confidence, missingCoreCount) {
  if (matchScore >= 88 && overlapScore >= 75 && confidence >= 82 && missingCoreCount <= 1) return "Strong Hire";
  if (matchScore >= 72 && overlapScore >= 55 && confidence >= 68 && missingCoreCount <= 3) return "Hire";
  if (matchScore >= 52 || overlapScore >= 40) return "Borderline";
  return "Do Not Hire";
}

function getSuggestedNextStep(recommendation, missingCoreCount) {
  if (recommendation === "Strong Hire" && missingCoreCount === 0) return "Hire directly or run a short culture/availability screen.";
  if (recommendation === "Strong Hire" || recommendation === "Hire") return "Send a focused final challenge covering the remaining gaps.";
  if (recommendation === "Borderline") return "Send a final challenge only if the candidate is otherwise promising.";
  return "Reject for this role and suggest a better-matched challenge path.";
}

function buildDecisionRisks(missingSkills, profile, proofConfidence) {
  const risks = [];
  if (missingSkills.length) {
    risks.push(`Skill gaps: ${missingSkills.slice(0, 3).join(", ")}.`);
  }
  if (proofConfidence < 70) {
    risks.push("Uncertainty: Proof Engine confidence is below the preferred threshold.");
  }
  if (!profile?.proofAnalysis?.file_structure?.length) {
    risks.push("Missing proof: repository file structure was not detected.");
  }
  if (!profile?.proofAnalysis?.github_readme_excerpt) {
    risks.push("Missing proof: README signal was not detected.");
  }
  return risks.length ? risks : ["Low risk: core proof signals and required skill overlap are present."];
}

function matchItems(items = [], profile) {
  const evidence = getProfileEvidence(profile);
  return items.map((item) => {
    const itemTokens = tokenize(expandSkillTerms(item));
    const bestMatch = evidence.reduce((best, evidenceItem) => {
      const evidenceTokens = tokenize(expandSkillTerms(`${evidenceItem.label} ${evidenceItem.evidence}`));
      const overlap = itemTokens.filter((token) => evidenceTokens.includes(token)).length;
      const score = itemTokens.length ? overlap / itemTokens.length : 0;
      return score > best.score ? { ...evidenceItem, score } : best;
    }, { score: 0, label: "", evidence: "" });

    return {
      label: item,
      matched: bestMatch.score >= 0.34,
      confidence: bestMatch.score,
      evidence: bestMatch.evidence
    };
  });
}

function getProfileEvidence(profile) {
  const skills = profile?.skillScores || [];
  const badges = profile?.earnedBadges || [];
  return [
    ...skills.map((skill) => ({
      label: skill.skill,
      evidence: skill.evidence,
      score: Number(skill.score || 0)
    })),
    ...badges.map((badge) => ({
      label: badge.title,
      evidence: badge.evidence,
      score: Number(badge.score || 0)
    })),
    {
      label: "Employer summary",
      evidence: profile?.employerSummary || "",
      score: getAverageScore(profile)
    }
  ];
}

function getMatchRatio(matches) {
  if (!matches.length) return 0;
  return matches.filter((item) => item.matched).length / matches.length;
}

function normalizeWeights(weights = {}) {
  const raw = {
    required_skills: Number(weights.required_skills ?? 0.5),
    nice_to_have_skills: Number(weights.nice_to_have_skills ?? 0.15),
    deliverables: Number(weights.deliverables ?? 0.2),
    proof_quality: Number(weights.proof_quality ?? 0.15)
  };
  const total = Object.values(raw).reduce((sum, value) => sum + Math.max(value, 0), 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Math.max(value, 0) / total]));
}

function buildMatchExplanation(candidate, score, matchedSkills, missingSkills, profile, parsedJob) {
  const role = parsedJob?.role_title || "this role";
  const proof = profile?.earnedBadges?.[0]?.evidence || candidate.proof;
  const strongest = matchedSkills.slice(0, 3);
  const gaps = missingSkills.slice(0, 2);
  const fitLevel = score >= 85 ? "strong fit" : score >= 70 ? "promising fit" : score >= 55 ? "partial fit" : "early fit";

  if (!matchedSkills.length) {
    return `${candidate.name} is an ${fitLevel} for ${role}. They have verified project proof, but the evidence does not strongly overlap with the core requirements yet. A focused follow-up challenge should test ${missingSkills.slice(0, 3).join(", ") || "the highest-priority job skills"}.`;
  }

  const core = strongest.join(", ");
  const gapSentence = gaps.length
    ? ` They still need evidence for ${gaps.join(" and ")}, so those should be covered in the final challenge.`
    : " They meet the core requirements with no major missing skill in the current parse.";
  return `${candidate.name} is a ${fitLevel} for ${role} because they have proven ${core} in verified work. The strongest evidence comes from ${proof}.${gapSentence}`;
}

function tokenize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !["and", "with", "for", "the", "url"].includes(token));
}

function expandSkillTerms(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("ui", "ui interface frontend")
    .replaceAll("api", "api fetch endpoint integration data")
    .replaceAll("dashboard", "dashboard layout navigation transaction data table")
    .replaceAll("transaction", "transaction financial payment fintech data")
    .replaceAll("transactions", "transaction financial payment fintech data")
    .replaceAll("responsive", "responsive mobile desktop layout")
    .replaceAll("mobile", "mobile responsive small screen")
    .replaceAll("form", "form validation input submit email")
    .replaceAll("forms", "form validation input submit email")
    .replaceAll("deliverable", "live demo github repository explanation proof")
    .replaceAll("github", "github repository code structure")
    .replaceAll("live demo", "live demo deployment url");
}

// ─── AuthScreen ──────────────────────────────────────────────────────────────

function AuthScreen({ onAuth, chosenRole, onBack }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    country: "",
    role: chosenRole === "employer" ? "company" : "talent",
    company_name: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((f) => ({
      ...f,
      role: chosenRole === "employer" ? "company" : "talent"
    }));
  }, [chosenRole]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.email.trim()) { setError("Email is required."); return; }
    if (tab === "signup" && !form.name.trim()) { setError("Name is required."); return; }

    setLoading(true);
    setError("");
    try {
      const endpoint = tab === "signup" ? "/auth/signup" : "/auth/login";
      const data = await fetchJson(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      onAuth({
        userId: data.user.id,
        name: data.user.name,
        email: data.user.email,
        country: data.user.country,
        role: data.user.role,
        profileId: data.profileId
      });
    } catch (err) {
      setError(err.message || "Could not reach the server. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  const pathLabel = chosenRole === "employer" ? "Looking for talent" : "Proving my skills";

  return (
    <div className={`auth-screen auth-screen--${chosenRole === "employer" ? "employer" : "talent"}`}>
      <div className="auth-card">
        <button type="button" className="auth-back" onClick={onBack}>
          <ChevronLeft size={18} /> Choose path again
        </button>
        <div className="auth-brand">
          <span className="mark"><Radar size={20} /></span>
          <h1>Unmapped</h1>
          <p className="auth-path-pill">{pathLabel}</p>
          <p>Log in or create an account to continue.</p>
        </div>

        <div className="auth-tabs">
          <button className={tab === "login" ? "active" : ""} type="button" onClick={() => { setTab("login"); setError(""); }}>Log In</button>
          <button className={tab === "signup" ? "active" : ""} type="button" onClick={() => { setTab("signup"); setError(""); }}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {tab === "signup" && (
            <label>
              Full name
              <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Your name" required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="you@example.com" required />
          </label>
          {tab === "signup" && (
            <>
              <label>
                Country
                <input value={form.country} onChange={(e) => setField("country", e.target.value)} placeholder="e.g. Nigeria" />
              </label>
              <p className="auth-role-locked">
                Account type: <strong>{form.role === "company" ? "Employer" : "Talent"}</strong>
                <span className="auth-role-hint"> (from the path you chose)</span>
              </p>
              <input type="hidden" name="role" value={form.role} />
              {form.role === "company" && (
                <label>
                  Company name
                  <input value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} placeholder="e.g. Acme Fintech" />
                </label>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            {loading ? "Please wait…" : tab === "login" ? "Log In" : "Create Account"}
          </button>
        </form>

        <div className="auth-demo">
          <p className="eyebrow"><ShieldCheck size={14} /> Demo credentials (just enter the email to log in)</p>
          <div className="demo-creds">
            <button type="button" onClick={() => { setTab("login"); setField("email", "amina@demo.unmapped"); }}>
              <UserRoundCheck size={14} /> Talent: amina@demo.unmapped
            </button>
            <button type="button" onClick={() => { setTab("login"); setField("email", "hr@demo.unmapped"); }}>
              <BriefcaseBusiness size={14} /> Company: hr@demo.unmapped
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TalentProfilePage ────────────────────────────────────────────────────────

function TalentProfilePage({ talentId, currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/talent/${talentId}/profile`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Could not load profile."); setLoading(false); });
  }, [talentId]);

  if (loading) return <div className="page-loading"><LoaderCircle className="spin" size={32} /><p>Loading profile…</p></div>;
  if (error) return <div className="page-error"><p>{error}</p></div>;
  if (!data) return null;

  const { user, profile, badges, submissions } = data;

  return (
    <div className="flow-grid">
      <aside className="rail">
        <Step done icon={<UserRoundCheck size={18} />} title="Identity" text={`${user.country || "—"} · ${user.role}`} />
        <Step done={badges.length > 0} icon={<BadgeCheck size={18} />} title="Badges" text={`${badges.length} verified badge${badges.length !== 1 ? "s" : ""}`} />
        <Step done={submissions.length > 0} icon={<UploadCloud size={18} />} title="Submissions" text={`${submissions.length} challenge${submissions.length !== 1 ? "s" : ""} completed`} />
      </aside>

      <div className="workspace">
        <div className="section-head">
          <div>
            <p className="eyebrow"><UserRoundCheck size={16} /> Public Profile</p>
            <h2>{user.name}</h2>
            <p>{profile?.headline || user.role} · {user.country || "—"}</p>
          </div>
        </div>

        {badges.length > 0 && (
          <section>
            <h3 className="section-label">Earned Badges</h3>
            <div className="badge-grid">
              {badges.map((b) => (
                <div className="badge" key={b.id}>
                  <BadgeCheck size={24} />
                  <h3>{b.badge_name}</h3>
                  <p>{b.skill_name} · {b.category}</p>
                  <span>{Math.round(b.confidence * 100)}% verified</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(profile?.skillProofs?.length || profile?.skillScores?.length) > 0 && (
          <section>
            <h3 className="section-label">Skill Reliability by Skill</h3>
            <SkillProofStrengthList skills={profile.skillProofs?.length ? profile.skillProofs : profile.skillScores} />
          </section>
        )}

        {submissions.length > 0 && (
          <section>
            <h3 className="section-label">Submission History</h3>
            <div className="submission-history">
              {submissions.map((s) => (
                <article className="history-card" key={s.id}>
                  <div>
                    <h3>{s.challenge_title}</h3>
                    <p>{s.challenge_description?.slice(0, 100)}…</p>
                    {s.project_type && <span className="api-pill">{s.project_type}</span>}
                  </div>
                  <div className="history-meta">
                    {s.confidence_score && <strong>{Math.round(s.confidence_score)}% confidence</strong>}
                    <span>{new Date(s.submitted_at).toLocaleDateString()}</span>
                    <div className="evidence-links">
                      {s.github_url && <a href={s.github_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> GitHub</a>}
                      {s.live_url && <a href={s.live_url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Live</a>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {badges.length === 0 && submissions.length === 0 && (
          <div className="empty-state">
            <p>No submissions yet. Complete a challenge to earn your first badge.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Talent job market (browse employer postings) ─────────────────────────

function TalentJobBoard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function loadJobs() {
    setLoading(true);
    setError("");
    fetch(`${API_BASE}/jobs`)
      .then((r) => r.json())
      .then((d) => { setJobs(Array.isArray(d) ? d : []); })
      .catch(() => { setError("Could not load job postings. Is the API running?"); })
      .finally(() => { setLoading(false); });
  }

  useEffect(() => { loadJobs(); }, []);

  const skillDemand = useMemo(() => {
    const counts = new Map();
    for (const j of jobs) {
      const list = j.parsed?.required_skills || j.parsed?.requiredSkills;
      if (!Array.isArray(list)) continue;
      for (const s of list) {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [jobs]);

  if (loading) {
    return (
      <div className="page-loading">
        <LoaderCircle className="spin" size={32} />
        <p>Loading open roles…</p>
      </div>
    );
  }

  return (
    <div className="workspace-full job-market">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Globe2 size={16} /> Open roles</p>
          <h2>Job postings and skill demand</h2>
          <p className="section-sub">
            Browse roles companies have posted. The strip below shows which skills show up most often so you can prioritize learning and evidence (badges) that match the market. Applying still happens through proof and shortlists — this view is for discovery.
          </p>
        </div>
        <button type="button" className="secondary" onClick={loadJobs}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      {skillDemand.length > 0 && (
        <section className="job-market-skills" aria-label="In-demand skills across postings">
          <h3>Most common required skills in this list</h3>
          <p className="muted">Count = how many postings list the skill in their required set.</p>
          <div className="match-chip-row job-market-skill-chips">
            {skillDemand.map(([skill, n]) => (
              <span key={skill} className="api-pill" title={`${n} posting(s)`}>
                {skill} · {n}
              </span>
            ))}
          </div>
        </section>
      )}
      {jobs.length === 0 && !error ? (
        <div className="empty-state">
          <p>No job postings yet. When employers publish roles, they will appear here.</p>
        </div>
      ) : (
        <div className="job-market-grid">
          {jobs.map((job) => {
            const p = job.parsed;
            const title = p?.role_title || "Open role";
            const req = p?.required_skills || p?.requiredSkills || [];
            const nice = p?.nice_to_have_skills || p?.niceToHaveSkills || [];
            return (
              <article className="history-card job-market-card" key={job.id}>
                <div className="job-market-card-top">
                  <h3>{title}</h3>
                  <span className="api-pill">{job.company_name || "Company"}</span>
                </div>
                {(job.company_industry || job.company_country) && (
                  <p className="muted job-market-co">
                    {[job.company_industry, job.company_country].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="job-market-snippet">
                  {String(job.raw_description || "").slice(0, 240)}
                  {String(job.raw_description || "").length > 240 ? "…" : ""}
                </p>
                {!!req.length && (
                  <div className="match-section">
                    <strong>Required skills</strong>
                    <div className="match-chip-row">
                      {req.map((s) => <span key={s} className="api-pill">{s}</span>)}
                    </div>
                  </div>
                )}
                {!!nice.length && (
                  <div className="match-section">
                    <strong>Nice to have</strong>
                    <div className="match-chip-row">
                      {nice.slice(0, 8).map((s) => <span key={s} className="api-pill api-pill--soft">{s}</span>)}
                    </div>
                  </div>
                )}
                <p className="muted job-market-date">
                  Posted {job.created_at ? new Date(job.created_at).toLocaleDateString() : "—"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ChallengeInbox ──────────────────────────────────────────────────────────

function ChallengeInbox({ talentId, currentUser }) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(null);

  function loadChallenges() {
    setLoading(true);
    fetch(`${API_BASE}/talent/${talentId}/final-challenges`)
      .then((r) => r.json())
      .then((d) => { setChallenges(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setError("Could not load inbox."); setLoading(false); });
  }

  useEffect(loadChallenges, [talentId]);

  async function markCompleted(id) {
    setUpdating(id);
    try {
      await fetch(`${API_BASE}/final-challenges/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" })
      });
      loadChallenges();
    } catch {
      setError("Could not update challenge status.");
    } finally {
      setUpdating(null);
    }
  }

  if (loading) return <div className="page-loading"><LoaderCircle className="spin" size={32} /><p>Loading inbox…</p></div>;

  return (
    <div className="workspace-full">
      <div className="section-head">
        <div>
          <p className="eyebrow"><MessageSquareText size={16} /> Company challenges</p>
          <h2>You have been invited to a company challenge</h2>
          <p className="section-sub">Company, task, deadline, expected output, and role context — then accept and submit work.</p>
        </div>
        <button className="secondary" type="button" onClick={loadChallenges}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}

      {challenges.length === 0 ? (
        <div className="empty-state">
          <p>No invitations yet. After employers shortlist you, they can add you to a mini hackathon; invites land here.</p>
        </div>
      ) : (
        <div className="inbox-list">
          {challenges.map((fc) => (
            <article className="inbox-card" key={fc.id}>
              <div className="inbox-header">
                <div>
                  <h3>{fc.company_name}</h3>
                  <p className="inbox-invite-banner">You have been invited to a company challenge.</p>
                </div>
                <span className={`status-pill ${fc.status}`}>{fc.status}</span>
              </div>
              <dl className="inbox-facts">
                <div><dt>Company</dt><dd>{fc.company_name}</dd></div>
                <div><dt>Task</dt><dd>{fc.challenge_text}</dd></div>
                <div><dt>Deadline</dt><dd>Demo: align with employer outside this record.</dd></div>
                <div><dt>Expected output</dt><dd>Repo + live demo + short write-up of tradeoffs (per employer brief).</dd></div>
                <div><dt>Role / payment</dt><dd>{fc.raw_description?.slice(0, 160) || "See job thread for compensation band and role title."}{fc.raw_description?.length > 160 ? "…" : ""}</dd></div>
              </dl>
              {fc.status === "sent" && (
                <button
                  className="primary"
                  type="button"
                  disabled={updating === fc.id}
                  onClick={() => markCompleted(fc.id)}
                >
                  {updating === fc.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                  Accept &amp; mark submitted
                </button>
              )}
              {fc.status === "completed" && (
                <p className="success-text"><Check size={14} /> Submitted. The employer sees your work in the ranked queue.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CompanyDashboard ─────────────────────────────────────────────────────────

function CompanyDashboard({ companyId, currentUser, onSelectJobForMatching }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    fetch(`${API_BASE}/companies/${companyId}/jobs`)
      .then((r) => r.json())
      .then((d) => { setJobs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setError("Could not load job history."); setLoading(false); });
  }, [companyId]);

  if (loading) return <div className="page-loading"><LoaderCircle className="spin" size={32} /><p>Loading dashboard…</p></div>;

  return (
    <div className="workspace-full company-posted-roles">
      <div className="section-head">
        <div>
          <p className="eyebrow"><BriefcaseBusiness size={16} /> Your company</p>
          <h2>Posted roles</h2>
          <p className="section-sub">Every job you have published, with how many candidates have been scored. Open the shortlist to keep reviewing matches the same way as on <strong>Match talent</strong>.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {jobs.length === 0 ? (
        <div className="empty-state">
          <p>No jobs posted yet. Go to <strong>Match talent</strong> and use &quot;Parse job with AI&quot; to add your first role.</p>
        </div>
      ) : (
        <div className="history-list">
          {jobs.map((job) => (
            <article className="history-card" key={job.id}>
              <div>
                <h3>{job.parsed?.role_title || "Untitled job"}</h3>
                <p>{(job.raw_description || "").slice(0, 140)}{(job.raw_description || "").length > 140 ? "…" : ""}</p>
                <div className="history-meta">
                  <span>{new Date(job.created_at).toLocaleDateString()}</span>
                  <span className="api-pill">{job.matchCount} candidates matched</span>
                  {(job.parsed?.required_skills || []).slice(0, 5).map((s) => <span key={s} className="api-pill">{s}</span>)}
                </div>
                {onSelectJobForMatching && (
                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onSelectJobForMatching(job)}
                    >
                      View shortlist
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
