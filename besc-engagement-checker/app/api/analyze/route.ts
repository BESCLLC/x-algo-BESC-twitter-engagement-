import { NextRequest, NextResponse } from "next/server";
import { analyzePost } from "@/lib/scoring";
import type { AnalyzeRequest, MediaType } from "@/lib/types";

const MAX_CHARS = 4000;
const VALID_MEDIA: MediaType[] = ["none", "photo", "video", "gif"];

export async function POST(req: NextRequest) {
  let body: Partial<AnalyzeRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, MAX_CHARS) : "";
  if (!text.trim()) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 }
    );
  }

  const mediaType: MediaType = VALID_MEDIA.includes(body.mediaType as MediaType)
    ? (body.mediaType as MediaType)
    : "none";

  const link = typeof body.link === "string" ? body.link.slice(0, 500) : "";
  const isReplyToMutual = Boolean(body.isReplyToMutual);
  const nsfw = Boolean(body.nsfw);
  const recentPostsCount = Math.max(
    0,
    Math.min(10, Number(body.recentPostsCount) || 0)
  );

  const result = analyzePost({
    text,
    mediaType,
    link,
    isReplyToMutual,
    recentPostsCount,
    nsfw,
  });

  return NextResponse.json(result);
}
