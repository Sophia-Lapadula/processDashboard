import { NextResponse, type NextRequest } from "next/server";
import { executeRun } from "@/lib/runs/execute";

export const runtime = "nodejs";
export const maxDuration = 800; // Vercel Pro com Fluid Compute permite até 800s

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const signingSecret = request.headers.get("x-platform-signing-secret");
  if (
    !process.env.PLATFORM_SIGNING_SECRET ||
    signingSecret !== process.env.PLATFORM_SIGNING_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await executeRun(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/runs/:id/execute]", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
