import { createHash } from "crypto";
import fs from "fs";
import path from "path";

export interface AuditEntry {
  timestamp: string;
  endpoint: string;
  intent?: string;
  jurisdictionId?: string;
  ruleVersion?: string;
  responseHash?: string;
  usedFallback?: boolean;
  confidence?: number;
}

const LOG_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogFile(): string {
  return path.join(LOG_DIR, `audit-${new Date().toISOString().split("T")[0]}.jsonl`);
}

export function writeAuditLog(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(getLogFile(), line, "utf-8");
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}
