import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 10;

/**
 * POST /api/transcribe
 * Accepts { audioBase64: string } (base64-encoded audio: webm/ogg/mp3/wav)
 * Returns { text: string } using the z-ai ASR service.
 * Used as a fallback when the browser has no Web Speech API.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { audioBase64?: string };
    const audioBase64 = body.audioBase64;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "audioBase64 is required" }, { status: 400 });
    }

    // Reasonable size guard (~12MB of raw audio => ~16MB base64)
    if (audioBase64.length > 16 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file too large" }, { status: 413 });
    }

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: audioBase64,
    });

    const text = (response.text || "").trim();
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[/api/transcribe] error:", err);
    return NextResponse.json(
      { error: "Transcription failed. Please try again or type your message." },
      { status: 500 }
    );
  }
}
