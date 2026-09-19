import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

/**
 * POST /api/tts
 * Body: { text: string, voice?: string, speed?: number }
 *
 * Returns: audio/wav binary
 *
 * Uses the z-ai-web-dev-sdk's neural TTS to produce a natural-sounding
 * female voice for the SpeakFix agent "Iris". Server-side only — the SDK
 * cannot be imported in client components.
 *
 * Auth required: the caller must be logged in. This prevents anonymous
 * abuse of the TTS endpoint (e.g. someone using it to generate arbitrary
 * speech outside of SpeakFix).
 *
 * Voice choices (all female unless noted):
 *   - tongtong   (warm, friendly)        ← DEFAULT for Iris
 *   - xiaochen   (steady, professional)
 *   - chuichui   (lively, younger)
 *   - jam        (English gentleman — male, skip)
 *   - kazi       (clear, standard)
 *   - douji      (natural, flowing)
 *   - luodo      (expressive, rich)
 *
 * The voice is configured via env var SPEAKFIX_TTS_VOICE (default: tongtong).
 *
 * Input length: max 1024 chars per request (z-ai API limit). We slice to 1000
 * for safety; long replies should already be chunked by the caller.
 */
export const maxDuration = 10;

const DEFAULT_VOICE = process.env.SPEAKFIX_TTS_VOICE || "tongtong";
const VALID_VOICES = new Set(["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"]);

export async function POST(req: NextRequest) {
  try {
    // Auth check — TTS is only for logged-in SpeakFix users.
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to use the voice agent." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as { text?: string; voice?: string; speed?: number };
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 1000) {
      return NextResponse.json(
        { error: "Text too long. Maximum 1000 characters per request." },
        { status: 413 }
      );
    }

    const voice = VALID_VOICES.has(body.voice || "") ? body.voice! : DEFAULT_VOICE;
    const speed = typeof body.speed === "number" && body.speed >= 0.5 && body.speed <= 2.0
      ? body.speed
      : 1.0;

    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();

    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[/api/tts] error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Could not generate speech right now. Please try again." },
      { status: 500 }
    );
  }
}
