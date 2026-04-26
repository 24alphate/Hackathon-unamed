/**
 * Runtime live-demo verification.
 * - Uses Playwright when available.
 * - Falls back safely when unavailable or failing.
 */

import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "data", "screenshots");

function ensureScreenshotDir() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function defaultResult(url, reason = "not_inspected") {
  return {
    url: url || "",
    inspected: false,
    reason,
    screenshotCount: 0,
    viewportChecks: [],
    consoleErrorCount: 0,
    networkRequestCount: 0,
    apiRequestDetected: false,
    formDetected: false,
    responsiveEvidence: false,
    screenshots: []
  };
}

export async function analyzeLiveDemo(url) {
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    return defaultResult(url, "no_url");
  }

  if (String(process.env.ENABLE_PLAYWRIGHT_VERIFY || "").trim() !== "1") {
    return defaultResult(url, "playwright_disabled");
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return defaultResult(url, "playwright_not_installed");
  }

  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1366, height: 768 }
  ];

  ensureScreenshotDir();
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const out = {
    url,
    inspected: true,
    reason: "ok",
    screenshotCount: 0,
    viewportChecks: [],
    consoleErrorCount: 0,
    networkRequestCount: 0,
    apiRequestDetected: false,
    formDetected: false,
    responsiveEvidence: false,
    screenshots: []
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") out.consoleErrorCount += 1;
    });
    page.on("request", (req) => {
      out.networkRequestCount += 1;
      const u = req.url().toLowerCase();
      if (u.includes("/api/") || u.includes("graphql") || u.includes("endpoint")) {
        out.apiRequestDetected = true;
      }
    });

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
      await page.waitForTimeout(900);

      const forms = await page.locator("form").count();
      if (forms > 0) out.formDetected = true;

      const screenshotPath = join(SCREENSHOT_DIR, `${runId}-${vp.name}.png`);
      await page.screenshot({ fullPage: false, path: screenshotPath });
      out.screenshotCount += 1;
      out.screenshots.push({ viewport: vp.name, path: screenshotPath });
      out.viewportChecks.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        formsFound: forms,
        screenshotPath
      });
    }

    out.responsiveEvidence = out.viewportChecks.length >= 2;
    return out;
  } catch (error) {
    return {
      ...out,
      inspected: false,
      reason: `playwright_error:${error?.message ? String(error.message).slice(0, 140) : "unknown"}`
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      // no-op
    }
  }
}

