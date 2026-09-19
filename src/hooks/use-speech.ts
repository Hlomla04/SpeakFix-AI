"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Text-to-speech output for the agent's replies.
 *
 * PRIMARY PATH (natural female voice):
 *   POST /api/tts → server calls z-ai-web-dev-sdk's neural TTS → audio/wav
 *   → play via <audio> element. This produces a NATURAL female voice that
 *   doesn't sound like a robot.
 *
 * FALLBACK PATH (if /api/tts fails or is unreachable):
 *   browser speechSynthesis with the best available female English voice.
 *   Still better than nothing if the cloud TTS is down.
 *
 * Barge-in support: cancel when the user starts talking.
 *
 * The voice is configured via the SPEAKFIX_TTS_VOICE env var on the server
 * (default: "tongtong" — a warm, friendly female voice).
 */

export function useSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const enabledRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Lazy-create the audio element on the client (SSR-safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setSpeaking(false));
      audioRef.current.addEventListener("error", () => setSpeaking(false));
      audioRef.current.addEventListener("pause", () => setSpeaking(false));
    }
  }, []);

  // Mark voices ready for the fallback path (in case it's used)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoicesReady(true);
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  /* ----------------------------- fallback TTS ----------------------------- */

  const pickFallbackVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    // Prefer a natural female English voice as fallback
    const femaleNames = /^Microsoft Aria\b|^Microsoft Jenny\b|^Microsoft Michelle\b|^Aria\b|^Jenny\b|^Samantha\b|^Victoria\b|^Karen\b|^Moira\b|^Fiona\b|^Serena\b|^Allison\b|^Ava\b|Google UK English Female/i;
    const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    const pool = english.length ? english : voices;
    return pool.find((v) => femaleNames.test(v.name)) ?? pool[0] ?? voices[0];
  }, []);

  const speakViaBrowser = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const chunks = text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600)
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    const voice = pickFallbackVoice();
    chunks.forEach((chunk, idx) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-US";
      u.rate = 0.95;
      u.pitch = 1.06;
      if (idx === chunks.length - 1) {
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
      }
      window.speechSynthesis.speak(u);
    });
    setSpeaking(true);
  }, [pickFallbackVoice]);

  /* ------------------------------- main TTS ------------------------------- */

  const cancel = useCallback(() => {
    // Cancel cloud TTS audio
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // Cancel any in-flight fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Also cancel the browser fallback if it's running
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (typeof window === "undefined") return;
      if (!enabledRef.current || !text.trim()) return;

      // Cancel any previous playback
      cancel();

      // Clean the text for natural speech:
      //  - Replace em-dashes / en-dashes with commas (they sound bad as "dash" when spoken)
      //  - Collapse whitespace
      //  - Strip markdown that the LLM might accidentally emit (asterisks, underscores)
      const cleaned = text
        .replace(/\s*—\s*/g, ", ")
        .replace(/\s*–\s*/g, ", ")
        .replace(/\s*–\s*/g, ", ")
        .replace(/[*_`#]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
      if (!cleaned) return;

      setSpeaking(true);

      // PRIMARY PATH: cloud neural TTS (natural female voice)
      try {
        const ac = new AbortController();
        abortRef.current = ac;
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleaned }),
          signal: ac.signal,
        });
        if (!res.ok) {
          throw new Error(`TTS API ${res.status}`);
        }
        const blob = await res.blob();
        if (!blob.size) throw new Error("empty audio");
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
          };
          audioRef.current.onerror = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
            // Fall back to browser TTS if audio playback fails
            speakViaBrowser(cleaned);
          };
          await audioRef.current.play().catch(() => {
            // Autoplay may be blocked — fall back to browser TTS
            URL.revokeObjectURL(url);
            speakViaBrowser(cleaned);
          });
        }
        return;
      } catch (err) {
        // AbortError happens when barge-in cancels — that's fine, don't fall back.
        if (err instanceof DOMException && err.name === "AbortError") {
          setSpeaking(false);
          return;
        }
        console.warn("[use-speech] cloud TTS failed, falling back to browser:", err instanceof Error ? err.message : String(err));
        // FALLBACK PATH: browser speechSynthesis
        speakViaBrowser(cleaned);
      }
    },
    [cancel, speakViaBrowser]
  );

  return { enabled, setEnabled, speaking, speak, cancel, voicesReady };
}
