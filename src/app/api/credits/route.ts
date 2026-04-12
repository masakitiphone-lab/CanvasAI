import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getCreditSummary, listCreditLedger } from "@/lib/credit-ledger";

export async function GET(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const [summary, ledger] = await Promise.all([
    getCreditSummary(auth.user.id),
    listCreditLedger(auth.user.id, 24),
  ]);

  return NextResponse.json({
    ok: true,
    summary,
    ledger,
  });
}
