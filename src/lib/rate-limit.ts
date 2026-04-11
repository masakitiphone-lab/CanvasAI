const buckets = new Map<string, { count: number; resetAt: number }>();

function getLimitValue(envKey: string, fallback: number) {
  const raw = process.env[envKey]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRateLimitConfig(scope: "default" | "generation") {
  if (scope === "generation") {
    return {
      limit: getLimitValue("RATE_LIMIT_GENERATION_LIMIT", 24),
      windowMs: getLimitValue("RATE_LIMIT_GENERATION_WINDOW_MS", 60_000),
    };
  }

  return {
    limit: getLimitValue("RATE_LIMIT_DEFAULT_LIMIT", 120),
    windowMs: getLimitValue("RATE_LIMIT_DEFAULT_WINDOW_MS", 60_000),
  };
}

export function consumeRateLimit(params: {
  key: string;
  scope?: "default" | "generation";
}) {
  const { limit, windowMs } = getRateLimitConfig(params.scope ?? "default");
  const now = Date.now();
  const current = buckets.get(params.key);

  if (!current || current.resetAt <= now) {
    buckets.set(params.key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { ok: false as const, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  buckets.set(params.key, current);
  return { ok: true as const, remaining: limit - current.count, resetAt: current.resetAt };
}
