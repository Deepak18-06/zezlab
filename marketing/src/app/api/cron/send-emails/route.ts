import { NextRequest, NextResponse } from "next/server";
import { drainQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await drainQueue();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("drainQueue error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
