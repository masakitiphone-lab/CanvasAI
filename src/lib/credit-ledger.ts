import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import type { ConversationModelName, ConversationPromptMode } from "@/lib/canvas-types";

const DATA_DIR = path.join(process.cwd(), "data");
const CREDIT_STATE_FILE = path.join(DATA_DIR, "credit-state.json");
const DEFAULT_DAILY_CREDITS = Number(process.env.DAILY_CREDIT_GRANT ?? 500);
const CREDIT_TIME_ZONE = process.env.CREDIT_TIME_ZONE ?? "Asia/Singapore";
let memoryCreditState: LocalCreditState = {
  balances: [],
  ledger: [],
};

type CreditBalanceRow = {
  user_id: string;
  balance: number;
  daily_grant_amount: number;
  last_daily_grant_date: string | null;
};

type CreditLedgerRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  amount: number;
  direction: "grant" | "debit" | "refund";
  reason: string;
  model_name: string | null;
  prompt_mode: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type LocalCreditState = {
  balances: CreditBalanceRow[];
  ledger: CreditLedgerRow[];
};

type CreditSummaryRpcRow = {
  balance: number;
  daily_grant_amount: number;
  last_daily_grant_date: string | null;
};

type ConsumeCreditsRpcRow = {
  ok: boolean;
  balance: number;
  required: number;
  debited: number;
};

export type CreditSummary = {
  balance: number;
  dailyGrantAmount: number;
  lastDailyGrantDate: string | null;
};

export type CreditLedgerEntry = {
  id: string;
  amount: number;
  direction: "grant" | "debit" | "refund";
  reason: string;
  modelName: string | null;
  promptMode: string | null;
  projectId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CREDIT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }

  return data ?? null;
}

function requireCreditAdminClient() {
  const supabase = getSupabaseAdminClient();
  return supabase;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readLocalCreditState(): Promise<LocalCreditState> {
  if (isProduction()) {
    return memoryCreditState;
  }

  try {
    const raw = await readFile(CREDIT_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as LocalCreditState;
    return {
      balances: Array.isArray(parsed.balances) ? parsed.balances : [],
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
    };
  } catch {
    return { balances: [], ledger: [] };
  }
}

async function writeLocalCreditState(state: LocalCreditState) {
  if (isProduction()) {
    memoryCreditState = state;
    return;
  }

  await ensureDataDir();
  await writeFile(CREDIT_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function modelCost(modelName: ConversationModelName) {
  switch (modelName) {
    case "gemini-3.1-flash-lite":
      return 1;
    case "gemini-3.1-flash":
    case "gemini-2.5-flash":
      return 2;
    case "gemini-3.1-pro":
    case "gemini-2.5-pro":
      return 6;
    case "gemini-3.1-flash-image":
    case "gemini-2.5-flash-image":
      return 10;
    case "gemini-3-pro-image":
      return 12;
    case "imagen-4.0-generate-001":
      return 14;
    default:
      return 3;
  }
}

function promptModeCost(promptMode: ConversationPromptMode) {
  switch (promptMode) {
    case "image-create":
      return 8;
    case "deep-research":
      return 20;
    case "auto":
    default:
      return 1;
  }
}

export function estimateCreditCost(params: {
  promptMode: ConversationPromptMode;
  modelName: ConversationModelName;
  attachmentCount?: number;
}) {
  const attachmentCost = Math.min(4, Math.max(0, params.attachmentCount ?? 0));
  return promptModeCost(params.promptMode) + modelCost(params.modelName) + attachmentCost;
}

async function getLocalBalance(userId: string) {
  const state = await readLocalCreditState();
  let row = state.balances.find((entry) => entry.user_id === userId);

  if (!row) {
    row = {
      user_id: userId,
      balance: 0,
      daily_grant_amount: DEFAULT_DAILY_CREDITS,
      last_daily_grant_date: null,
    };
    state.balances.push(row);
    await writeLocalCreditState(state);
  }

  return { row, state };
}

async function saveLocalBalance(row: CreditBalanceRow) {
  const state = await readLocalCreditState();
  const index = state.balances.findIndex((entry) => entry.user_id === row.user_id);

  if (index >= 0) {
    state.balances[index] = row;
  } else {
    state.balances.push(row);
  }

  await writeLocalCreditState(state);
}

async function appendLocalLedger(row: CreditLedgerRow) {
  const state = await readLocalCreditState();
  state.ledger.push(row);
  await writeLocalCreditState(state);
}

async function applyDailyCreditsLocally(userId: string): Promise<CreditSummary> {
  const today = getTodayKey();
  const { row } = await getLocalBalance(userId);

  if (row.last_daily_grant_date !== today) {
    row.balance += row.daily_grant_amount;
    row.last_daily_grant_date = today;
    await saveLocalBalance(row);
    await appendLocalLedger({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: null,
      amount: row.daily_grant_amount,
      direction: "grant",
      reason: "daily_grant",
      model_name: null,
      prompt_mode: null,
      request_id: null,
      metadata: { timeZone: CREDIT_TIME_ZONE },
      created_at: new Date().toISOString(),
    });
  }

  return {
    balance: row.balance,
    dailyGrantAmount: row.daily_grant_amount,
    lastDailyGrantDate: row.last_daily_grant_date,
  };
}

async function callCreditSummaryRpc(userId: string): Promise<CreditSummary | null> {
  const supabase = requireCreditAdminClient();
  if (!supabase) {
    return null;
  }

  const result = await supabase.rpc("apply_daily_credit_grant", {
    p_user_id: userId,
  });

  if (result.error) {
    if (isProduction()) {
      throw result.error;
    }
    return null;
  }

  const row = normalizeRpcRow(result.data as CreditSummaryRpcRow | CreditSummaryRpcRow[] | null);
  if (!row) {
    if (isProduction()) {
      throw new Error("Credit summary RPC returned no data.");
    }
    return null;
  }

  return {
    balance: row.balance,
    dailyGrantAmount: row.daily_grant_amount,
    lastDailyGrantDate: row.last_daily_grant_date,
  };
}

export async function listCreditLedger(userId: string, limit = 20): Promise<CreditLedgerEntry[]> {
  const supabase = requireCreditAdminClient();

  if (supabase) {
    const result = await supabase
      .from("credit_ledger")
      .select("id, amount, direction, reason, model_name, prompt_mode, project_id, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result.error) {
      if (isProduction()) {
        throw result.error;
      }
    } else {
      return ((result.data ?? []) as Array<{
        id: string;
        amount: number;
        direction: "grant" | "debit" | "refund";
        reason: string;
        model_name: string | null;
        prompt_mode: string | null;
        project_id: string | null;
        created_at: string;
        metadata: Record<string, unknown> | null;
      }>).map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        direction: entry.direction,
        reason: entry.reason,
        modelName: entry.model_name,
        promptMode: entry.prompt_mode,
        projectId: entry.project_id,
        createdAt: entry.created_at,
        metadata: entry.metadata ?? {},
      }));
    }
  }

  const state = await readLocalCreditState();
  return state.ledger
    .filter((entry) => entry.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      direction: entry.direction,
      reason: entry.reason,
      modelName: entry.model_name,
      promptMode: entry.prompt_mode,
      projectId: entry.project_id,
      createdAt: entry.created_at,
      metadata: entry.metadata,
    }));
}

export async function ensureDailyCredits(userId: string): Promise<CreditSummary> {
  const summary = await callCreditSummaryRpc(userId);
  if (summary) {
    return summary;
  }

  return applyDailyCreditsLocally(userId);
}

export async function getCreditSummary(userId: string) {
  return ensureDailyCredits(userId);
}

export async function consumeCredits(params: {
  userId: string;
  projectId?: string | null;
  amount: number;
  reason: string;
  modelName?: ConversationModelName | null;
  promptMode?: ConversationPromptMode | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = requireCreditAdminClient();

  if (supabase) {
    const result = await supabase.rpc("consume_credits_atomic", {
      p_user_id: params.userId,
      p_project_id: params.projectId ?? null,
      p_amount: params.amount,
      p_reason: params.reason,
      p_model_name: params.modelName ?? null,
      p_prompt_mode: params.promptMode ?? null,
      p_request_id: params.requestId ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (result.error) {
      if (isProduction()) {
        throw result.error;
      }
    } else {
      const row = normalizeRpcRow(result.data as ConsumeCreditsRpcRow | ConsumeCreditsRpcRow[] | null);
      if (!row) {
        if (isProduction()) {
          throw new Error("Credit debit RPC returned no data.");
        }
      } else {
        return {
          ok: row.ok,
          balance: row.balance,
          required: row.required,
          debited: row.debited,
        };
      }
    }
  }

  const summary = await applyDailyCreditsLocally(params.userId);
  if (summary.balance < params.amount) {
    return {
      ok: false as const,
      balance: summary.balance,
      required: params.amount,
      debited: 0,
    };
  }

  const { row } = await getLocalBalance(params.userId);
  row.balance -= params.amount;
  await saveLocalBalance(row);
  await appendLocalLedger({
    id: crypto.randomUUID(),
    user_id: params.userId,
    project_id: params.projectId ?? null,
    amount: params.amount,
    direction: "debit",
    reason: params.reason,
    model_name: params.modelName ?? null,
    prompt_mode: params.promptMode ?? null,
    request_id: params.requestId ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  return {
    ok: true as const,
    balance: row.balance,
    required: params.amount,
    debited: params.amount,
  };
}

export async function refundCredits(params: {
  userId: string;
  projectId?: string | null;
  amount: number;
  reason: string;
  modelName?: ConversationModelName | null;
  promptMode?: ConversationPromptMode | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (params.amount <= 0) {
    return;
  }

  const supabase = requireCreditAdminClient();

  if (supabase) {
    const result = await supabase.rpc("refund_credits_atomic", {
      p_user_id: params.userId,
      p_project_id: params.projectId ?? null,
      p_amount: params.amount,
      p_reason: params.reason,
      p_model_name: params.modelName ?? null,
      p_prompt_mode: params.promptMode ?? null,
      p_request_id: params.requestId ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (result.error) {
      if (isProduction()) {
        throw result.error;
      }
    } else {
      return;
    }
  }

  const { row } = await getLocalBalance(params.userId);
  row.balance += params.amount;
  await saveLocalBalance(row);
  await appendLocalLedger({
    id: crypto.randomUUID(),
    user_id: params.userId,
    project_id: params.projectId ?? null,
    amount: params.amount,
    direction: "refund",
    reason: params.reason,
    model_name: params.modelName ?? null,
    prompt_mode: params.promptMode ?? null,
    request_id: params.requestId ?? null,
    metadata: params.metadata ?? {},
    created_at: new Date().toISOString(),
  });
}
