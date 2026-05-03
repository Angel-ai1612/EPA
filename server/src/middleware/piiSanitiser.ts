import type { Request, Response, NextFunction } from "express";

const PII_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b\d{12}\b/g, label: "[AADHAAR]" },
  { pattern: /\b[6-9]\d{9}\b/g, label: "[PHONE]" },
  { pattern: /[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: "[EMAIL]" },
  { pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, label: "[PAN]" },
  { pattern: /\b[A-Z]{3}\d{7}\b/g, label: "[PASSPORT]" },
];

export function sanitizePII(text: string): string {
  let sanitized = text;
  for (const { pattern, label } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, label);
  }
  return sanitized;
}

export function piiMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") return sanitizePII(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, sanitizeObject(v)])
    );
  }
  return obj;
}
