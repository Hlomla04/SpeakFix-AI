"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Minimal Web Speech API type declarations (not in standard TS lib)   */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

interface UseVoiceInputOptions {
  lang?: string;
  /** Called with each finalized utterance (Web Speech API path) */
  onFinalResult: (text: string) => void;
  /** Called when an error occurs (fallback exhausted etc.) */
  onError?: (message: string) => void;
}

interface UseVoiceInputReturn {
  /** true when the browser supports the Web Speech API */
  speechApiSupported: boolean;
  /** true while the mic is actively capturing */
  isListening: boolean;
  /** live partial transcript while listening (Web Speech API only) */
  interimTranscript: string;
  /** true while recorded audio is being transcribed server-side (fallback path) */
  isTranscribing: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Voice input with two paths:
 *  1. Web Speech API (Chrome / Edge): live interim transcripts
 *  2. MediaRecorder + POST /api/transcribe (z-ai ASR): fallback for other browsers
 */
export function useVoiceInput({
  lang = "en-US",
  onFinalResult,
  onError,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [speechApiSupported, setSpeechApiSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const shouldListenRef = useRef(false); // auto-restart guard for Web Speech API
  const onFinalRef = useRef(onFinalResult);
  const onErrorRef = useRef(onError);
  const finalBufferRef = useRef(""); // accumulate finals within one session
  // Ref to the recorder-start function, so the Web Speech API error handler
  // can fall back to the recorder path without creating a useCallback cycle.
  const startRecorderRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    onFinalRef.current = onFinalResult;
    onErrorRef.current = onError;
  }, [onFinalResult, onError]);

  useEffect(() => {
    const ctor = getSpeechRecognitionCtor();
    setSpeechApiSupported(Boolean(ctor));
    return () => {
      shouldListenRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      stopMediaRecorder();
    };
  }, []);

  /* ------------------------- Web Speech API ------------------------ */

  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) return null;

    const recognition = new ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalBufferRef.current += (finalBufferRef.current ? " " : "") + transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      // Common error codes from the Web Speech API:
      //   no-speech         → user paused too long, ignore (auto-restart will retry)
      //   aborted           → user stopped, ignore
      //   not-allowed / service-not-allowed → mic permission denied
      //   audio-capture     → no microphone found
      //   network           → browser couldn't reach its speech service (Google's
      //                       servers in Chrome) — common on corporate/educational
      //                       networks or in some regions. FALL BACK to our own
      //                       /api/transcribe (z-ai ASR) which doesn't depend on
      //                       the browser's speech service.
      //   language-unavailable → browser doesn't support the requested lang
      //   service-unavailable / unknown → fall back to the recorder path too
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
        setIsListening(false);
        onErrorRef.current?.(
          "Microphone permission was denied. Please allow mic access in your browser and try again."
        );
        return;
      }
      if (event.error === "audio-capture") {
        shouldListenRef.current = false;
        setIsListening(false);
        onErrorRef.current?.(
          "No microphone was found. Please connect a microphone and try again, or use the text input option below."
        );
        return;
      }
      // network + any other error → switch to the MediaRecorder path which uses
      // our own /api/transcribe endpoint (z-ai ASR). This handles the common
      // case where Chrome's speech service is unreachable but the user's
      // general internet is fine (so they can still reach our API).
      console.warn("Web Speech API error, falling back to MediaRecorder:", event.error, event.message);
      try {
        // Stop the Web Speech API session first so we don't double-capture.
        shouldListenRef.current = false;
        try { recognitionRef.current?.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
        setIsListening(false);
        setInterimTranscript("");
        // Auto-start the recorder. The user clicked the mic, so they want to
        // speak — we shouldn't make them click again just because the browser
        // speech service went down.
        void startRecorderRef.current();
      } catch {
        onErrorRef.current?.(
          "Speech recognition isn't available in this browser right now. Please use the text input option below to type your report."
        );
      }
    };

    recognition.onend = () => {
      // Chrome fires onend periodically — restart if the user is still "holding the mic"
      if (shouldListenRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through to stop */
        }
      }
      // Session truly ended
      setIsListening(false);
      setInterimTranscript("");
      const finalText = finalBufferRef.current.trim();
      finalBufferRef.current = "";
      if (finalText) onFinalRef.current(finalText);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [lang]);

  /* --------------------------- Recorder ---------------------------- */

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Convert to base64 in chunks to avoid call-stack overflow
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64 }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      const text = (data.text || "").trim();
      if (text) onFinalRef.current(text);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Voice transcription failed";
      onErrorRef.current?.(message);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mimeCandidates = ["audio/webm", "audio/ogg", "audio/mp4", ""];
      const mimeType = mimeCandidates.find(
        (m) => m === "" || MediaRecorder.isTypeSupported(m)
      );
      const recorder =
        mimeType === ""
          ? new MediaRecorder(stream)
          : new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stopMediaRecorder();
        if (blob.size > 1000) {
          void transcribeBlob(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch {
      onErrorRef.current?.(
        "Could not access the microphone. Please check permissions and try again, or use the text input option below."
      );
      setIsListening(false);
    }
  }, [stopMediaRecorder, transcribeBlob]);

  // Keep the startRecorder ref in sync so the Web Speech API error handler
  // can fall back to the recorder path without a useCallback cycle.
  useEffect(() => {
    startRecorderRef.current = startRecorder;
  }, [startRecorder]);

  /* ---------------------------- Public ----------------------------- */

  const start = useCallback(() => {
    finalBufferRef.current = "";
    if (getSpeechRecognitionCtor()) {
      shouldListenRef.current = true;
      const recognition = ensureRecognition();
      if (recognition) {
        try {
          recognition.start();
          setIsListening(true);
        } catch {
          // already started — ignore
        }
      }
      return;
    }
    void startRecorder();
  }, [ensureRecognition, startRecorder]);

  const stop = useCallback(() => {
    if (getSpeechRecognitionCtor()) {
      shouldListenRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          /* noop */
        }
      }
      return;
    }
    stopMediaRecorder();
    setIsListening(false);
  }, [stopMediaRecorder]);

  return {
    speechApiSupported,
    isListening,
    interimTranscript,
    isTranscribing,
    start,
    stop,
  };
}
