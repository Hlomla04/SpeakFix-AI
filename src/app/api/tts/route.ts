import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const maxDuration = 10;

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

const VOICE_MAP: Record<string, string> = {
  rachel: "21m00Tcm4TlvDq8ikWVTO",
  bella: "EXAVITQu4vr4xnSDxMaL",
  domi: "AZnzlk1XvdvUeBnXmlld",
  elli: "MF3mGyEYCl7XYWbV9V6O",
  charlotte: "XB0fDUnXU5powZfKoy1D",
  matilda: "XrExEjyMj2FH5HbnvBvQ",
};

const DEFAULT_VOICE_ID = process.env.SPEAKFIX_TTS_VOICE || VOICE_MAP.rachel;

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "TTS not configured." }, { status: 500 });
    }

    const body = (await req.json()) as { text?: string; voice?: string };
    const text = (body.text || "").trim();
    if (!text || text.length > 1000) {
      return NextResponse.json({ error: "Invalid text." }, { status: 400 });
    }

    const voiceId = VOICE_MAP[body.voice || ""] || DEFAULT_VOICE_ID;

    const apiResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!apiResponse.ok) {
      return NextResponse.json({ error: "TTS failed." }, { status: 500 });
    }

    const buffer = Buffer.from(await apiResponse.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "TTS error." }, { status: 500 });
  }
}