/**
 * Embedding engine for semantic candidate–job matching.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims).
 * Embeddings are cached in candidate_embeddings; invalidated on new submission.
 *
 * Falls back to zero-vector (similarity = 0) when no API key is configured,
 * so downstream code always receives a numeric score.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";

// ─── Text builders ─────────────────────────────────────────────────────────────

/**
 * Serialize a candidate's skill profile into dense embedding text.
 * Only includes non-claimed skills with score >= 50 and verified badges.
 */
export function buildCandidateText(profile) {
  const skills = (profile.skillScores || [])
    .filter((s) => s.tier !== "claimed" && Number(s.score || 0) >= 50)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 20)
    .map((s) => {
      const tier = s.tier === "direct" ? "proven by artifact" : "inferred from structure";
      const evid = s.evidence ? ` — ${String(s.evidence).slice(0, 80)}` : "";
      return `${s.skill} (${Math.round(Number(s.score || 0))}%, ${tier}${evid})`;
    })
    .join("\n");

  const badges = (profile.earnedBadges || [])
    .map((b) => `VERIFIED: ${b.title}`)
    .join("\n");

  const summary = String(profile.employerSummary || "").slice(0, 300);
  const projectType = profile.proofAnalysis?.project_type || "";

  return [
    projectType ? `Project type: ${projectType}` : "",
    skills ? `Skills:\n${skills}` : "",
    badges ? `Verified badges:\n${badges}` : "",
    summary ? `Employer summary: ${summary}` : ""
  ].filter(Boolean).join("\n\n").slice(0, 5000);
}

/**
 * Serialize a parsed job into embedding text.
 */
export function buildJobText(parsedJob) {
  const required = (parsedJob.required_skills || parsedJob.required_capabilities || []).join(", ");
  const nice = (parsedJob.nice_to_have_skills || []).join(", ");
  const deliverables = (parsedJob.deliverables || parsedJob.required_deliverables || []).join(", ");
  const context = String(parsedJob.business_context || "").slice(0, 300);
  const technical = (parsedJob.technical_skills || []).join(", ");

  return [
    `Role: ${parsedJob.role_title || "unknown"}`,
    context ? `Context: ${context}` : "",
    required ? `Required skills: ${required}` : "",
    technical ? `Technical skills: ${technical}` : "",
    nice ? `Nice to have: ${nice}` : "",
    deliverables ? `Deliverables: ${deliverables}` : ""
  ].filter(Boolean).join("\n").slice(0, 3000);
}

// ─── Math ──────────────────────────────────────────────────────────────────────

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Math.max(-1, Math.min(1, dot / denom));
}

// ─── API call ──────────────────────────────────────────────────────────────────

export async function computeEmbedding(text) {
  if (!process.env.OPENAI_API_KEY || !text?.trim()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.trim().slice(0, 8191) }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

// ─── DB cache ──────────────────────────────────────────────────────────────────

export async function getOrComputeEmbedding(db, talentId, text) {
  const row = db.prepare(
    "SELECT embedding_vector FROM candidate_embeddings WHERE talent_id = ? AND model = ?"
  ).get(talentId, EMBEDDING_MODEL);

  if (row?.embedding_vector) {
    try { return JSON.parse(row.embedding_vector); } catch { /* re-compute */ }
  }

  const embedding = await computeEmbedding(text);
  if (!embedding) return null;

  db.prepare(`
    INSERT INTO candidate_embeddings (talent_id, embedding_text, embedding_vector, model)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(talent_id, model) DO UPDATE SET
      embedding_text = excluded.embedding_text,
      embedding_vector = excluded.embedding_vector,
      computed_at = datetime('now')
  `).run(talentId, text.slice(0, 500), JSON.stringify(embedding), EMBEDDING_MODEL);

  return embedding;
}

export function invalidateEmbedding(db, talentId) {
  db.prepare("DELETE FROM candidate_embeddings WHERE talent_id = ?").run(talentId);
}

// ─── Job embedding (ephemeral, not stored) ─────────────────────────────────────

export async function computeJobEmbedding(parsedJob) {
  return computeEmbedding(buildJobText(parsedJob));
}
