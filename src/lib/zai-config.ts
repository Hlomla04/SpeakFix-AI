import { writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let initialized = false;

export function ensureZaiConfig(): void {
  if (initialized) return;
  initialized = true;

  const configPaths = [
    "/etc/.z-ai-config",
    join(homedir(), ".z-ai-config"),
    join(process.cwd(), ".z-ai-config"),
  ];

  for (const p of configPaths) {
    try {
      if (existsSync(p)) return;
    } catch {}
  }

  const zaiConfig = process.env.ZAI_CONFIG;
  if (!zaiConfig) {
    console.warn("[zai-config] No config found and ZAI_CONFIG not set");
    return;
  }

  const targetPath = join(homedir(), ".z-ai-config");
  try {
    writeFileSync(targetPath, zaiConfig, { encoding: "utf-8", mode: 0o600 });
    console.log("[zai-config] Wrote config to", targetPath);
  } catch (err) {
    console.error("[zai-config] Failed:", err instanceof Error ? err.message : String(err));
  }
}