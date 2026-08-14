import { NextRequest, NextResponse } from "next/server";
import { optimizePost } from "@/lib/optimize";
import { parseAnalyzeRequest } from "@/lib/request";
import type { AnalyzeRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: Partial<AnalyzeRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseAnalyzeRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  return NextResponse.json(optimizePost(parsed));
}
