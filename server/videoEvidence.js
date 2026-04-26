import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { spawnSync } from "child_process";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function detectPlatform(url = "") {
  const u = String(url).toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("loom.com")) return "loom";
  if (u.includes("vimeo.com")) return "vimeo";
  return "direct_or_other";
}

function extractClaimHints(text = "") {
  const t = String(text).toLowerCase();
  return [
    t.includes("responsive") || t.includes("mobile") ? "candidate shows responsive layout" : "",
    t.includes("form") || t.includes("validation") ? "candidate shows form validation flow" : "",
    t.includes("api") || t.includes("fetch") ? "candidate shows API/data integration" : "",
    t.includes("dashboard") || t.includes("transaction") ? "candidate shows dashboard or transaction table" : ""
  ].filter(Boolean);
}

function ffmpegAvailable() {
  const out = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 2500 });
  return !out.error && out.status === 0;
}

async function downloadDirectVideo(videoUrl, workDir) {
  const res = await fetch(videoUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`video_download_http_${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_VIDEO_BYTES) throw new Error("video_too_large");
  if (!/video|octet-stream|mp4|webm|quicktime/i.test(contentType)) {
    throw new Error(`not_direct_video:${contentType || "unknown_content_type"}`);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > MAX_VIDEO_BYTES) throw new Error("video_too_large");
    chunks.push(chunk);
  }
  const cleanName = basename(new URL(videoUrl).pathname || "evidence-video.mp4").replace(/[^\w.-]/g, "_") || "evidence-video.mp4";
  const videoPath = join(workDir, cleanName);
  writeFileSync(videoPath, Buffer.concat(chunks));
  return { videoPath, contentType, bytes: total };
}

function extractMedia(videoPath, workDir) {
  if (!ffmpegAvailable()) {
    return { ffmpeg: false, audioPath: null, framePaths: [], error: "ffmpeg_not_available" };
  }
  const audioPath = join(workDir, "audio.wav");
  const audio = spawnSync("ffmpeg", ["-y", "-i", videoPath, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", audioPath], {
    encoding: "utf8",
    timeout: 30000
  });
  const framePattern = join(workDir, "frame-%02d.jpg");
  const frames = spawnSync("ffmpeg", ["-y", "-i", videoPath, "-vf", "fps=1/5,scale=960:-1", "-frames:v", "6", framePattern], {
    encoding: "utf8",
    timeout: 30000
  });
  const framePaths = [];
  for (let i = 1; i <= 6; i += 1) {
    const p = join(workDir, `frame-${String(i).padStart(2, "0")}.jpg`);
    if (existsSync(p)) framePaths.push(p);
  }
  return {
    ffmpeg: true,
    audioPath: existsSync(audioPath) && statSync(audioPath).size > 1000 ? audioPath : null,
    framePaths,
    error: audio.status === 0 || frames.status === 0 ? null : "ffmpeg_extract_failed"
  };
}

async function transcribeAudio(audioPath) {
  if (!audioPath || !process.env.OPENAI_API_KEY) return null;
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([readFileSync(audioPath)], { type: "audio/wav" }), "audio.wav");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) throw new Error(`transcription_http_${res.status}`);
  const data = await res.json();
  return String(data.text || "").trim();
}

async function summarizeFrames(framePaths = []) {
  if (!framePaths.length || !process.env.OPENAI_API_KEY) return null;
  const content = [
    {
      type: "input_text",
      text: "Summarize observable product behavior in these demo video frames. Return compact JSON with keys visible_ui, visible_interactions, visible_technical_claims, uncertainty."
    },
    ...framePaths.map((path) => ({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${readFileSync(path).toString("base64")}`
    }))
  ];
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content }]
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) throw new Error(`frame_vision_http_${res.status}`);
  const data = await res.json();
  return data.output_text || "";
}

function compareClaims(claims, artifacts = {}, liveDemoAnalysis = null) {
  const matched = [];
  const unverified = [];
  for (const c of claims) {
    if (c.includes("responsive")) {
      if (artifacts.staticSignals?.responsive_classes_detected || liveDemoAnalysis?.responsiveEvidence) matched.push(c);
      else unverified.push(c);
    } else if (c.includes("form")) {
      if (artifacts.staticSignals?.form_handling_detected || liveDemoAnalysis?.formDetected) matched.push(c);
      else unverified.push(c);
    } else if (c.includes("api")) {
      if (artifacts.staticSignals?.api_usage_detected || liveDemoAnalysis?.apiRequestDetected) matched.push(c);
      else unverified.push(c);
    } else {
      unverified.push(c);
    }
  }
  return { matched, unverified };
}

export async function analyzeVideoEvidence({ videoUrl, submission = {}, artifacts = {}, liveDemoAnalysis = null }) {
  if (!videoUrl) {
    return {
      provided: false,
      platform: null,
      analysis_mode: "none",
      downloaded: false,
      transcribed: false,
      frames_analyzed: 0,
      transcript_excerpt: "",
      frame_summary: "",
      video_claims: [],
      matched_to_evidence: [],
      unverified_claims: [],
      trust_note: "No video evidence provided."
    };
  }

  const platform = detectPlatform(videoUrl);
  const textClaims = extractClaimHints(`${submission.projectDescription || ""} ${submission.explanation || ""}`);
  const workDir = join(tmpdir(), `unmapped-video-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(workDir, { recursive: true });

  try {
    if (platform !== "direct_or_other") {
      const compared = compareClaims(textClaims, artifacts, liveDemoAnalysis);
      return {
        provided: true,
        platform,
        analysis_mode: "platform_url_claim_cross_check",
        downloaded: false,
        transcribed: false,
        frames_analyzed: 0,
        transcript_excerpt: "",
        frame_summary: "",
        video_claims: textClaims,
        matched_to_evidence: compared.matched,
        unverified_claims: compared.unverified,
        trust_note: "Platform video URLs are not downloaded by this MVP. Claims are cross-checked against code/runtime evidence only."
      };
    }

    const downloaded = await downloadDirectVideo(videoUrl, workDir);
    const media = extractMedia(downloaded.videoPath, workDir);
    let transcript = "";
    let frameSummary = "";
    try {
      transcript = await transcribeAudio(media.audioPath) || "";
    } catch (error) {
      transcript = "";
      media.transcriptionError = error?.message || "transcription_failed";
    }
    try {
      frameSummary = await summarizeFrames(media.framePaths) || "";
    } catch (error) {
      frameSummary = "";
      media.frameError = error?.message || "frame_analysis_failed";
    }
    const videoClaims = [
      ...textClaims,
      ...extractClaimHints(transcript),
      ...extractClaimHints(frameSummary)
    ].filter((claim, index, arr) => arr.indexOf(claim) === index);
    const compared = compareClaims(videoClaims, artifacts, liveDemoAnalysis);
    return {
      provided: true,
      platform,
      analysis_mode: process.env.OPENAI_API_KEY ? "direct_video_transcript_and_frame_analysis" : "direct_video_local_extraction_no_ai",
      downloaded: true,
      video_bytes: downloaded.bytes,
      content_type: downloaded.contentType,
      ffmpeg_available: media.ffmpeg,
      transcribed: Boolean(transcript),
      frames_analyzed: media.framePaths.length,
      transcript_excerpt: transcript.slice(0, 900),
      frame_summary: frameSummary.slice(0, 1200),
      video_claims: videoClaims,
      matched_to_evidence: compared.matched,
      unverified_claims: compared.unverified,
      errors: [media.error, media.transcriptionError, media.frameError].filter(Boolean),
      trust_note: compared.unverified.length
        ? "Video-derived claims are only partially supported by code/runtime evidence."
        : "Video-derived claims align with code/runtime evidence."
    };
  } catch (error) {
    const compared = compareClaims(textClaims, artifacts, liveDemoAnalysis);
    return {
      provided: true,
      platform,
      analysis_mode: "video_unavailable_claim_cross_check",
      downloaded: false,
      transcribed: false,
      frames_analyzed: 0,
      transcript_excerpt: "",
      frame_summary: "",
      video_claims: textClaims,
      matched_to_evidence: compared.matched,
      unverified_claims: compared.unverified,
      error: error?.message || "video_analysis_failed",
      trust_note: "Video could not be downloaded/analyzed; only text claims were cross-checked."
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // no-op
    }
  }
}
