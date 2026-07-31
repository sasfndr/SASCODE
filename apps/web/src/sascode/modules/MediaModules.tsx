// FILE: sascode/modules/MediaModules.tsx
// Purpose: The music and video modules.
// Layer: Presentation.
//
// Media rules the whole product depends on:
//  - nothing autoplays, and audio stays muted until the user presses play;
//  - a hidden module pauses rather than continuing to decode;
//  - media never becomes the focal point unless the user makes it so;
//  - embeds use a privacy-preserving origin.
//
// There is no Spotify integration in this backend, so this does not pretend to
// have one. It is a real generic player, and the provider slot says plainly
// what connecting would require.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconMusic,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";

export interface MediaModuleProps {
  /** False while the module is scrolled out of view or its space is inactive. */
  visible: boolean;
  configuration: Record<string, string>;
  onConfigure: (patch: Record<string, string>) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function MusicModule({ visible, configuration, onConfigure }: MediaModuleProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [urlDraft, setUrlDraft] = useState(configuration["sourceUrl"] ?? "");

  const source = configuration["sourceUrl"] ?? "";
  const title = configuration["title"] ?? "Untitled track";

  // A module that leaves the screen stops making sound. This is the rule that
  // keeps a workspace with many spaces from becoming a wall of noise.
  useEffect(() => {
    if (visible) return;
    audioRef.current?.pause();
    setPlaying(false);
  }, [visible]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || source.length === 0) return;
    if (audio.paused) {
      // Unmuting only ever happens as a direct result of this press.
      audio.muted = false;
      setMuted(false);
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [source]);

  if (source.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <IconMusic size={15} stroke={1.6} aria-hidden="true" style={{ color: "var(--sas-text-muted)" }} />
          <p className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
            Music
          </p>
        </div>
        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-secondary)" }}>
          Point this at an audio stream to play it here. A Spotify connection
          needs an authenticated provider, which this workspace does not have
          configured yet.
        </p>
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (urlDraft.trim().length > 0) onConfigure({ sourceUrl: urlDraft.trim() });
          }}
        >
          <input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="Audio stream URL"
            aria-label="Audio stream URL"
            className="sas-focusable min-w-0 flex-1 rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11.5px] outline-none"
            style={{
              backgroundColor: "var(--sas-surface-sunken)",
              color: "var(--sas-text)",
              border: "1px solid var(--sas-line)",
            }}
          />
          <button
            type="submit"
            className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2.5 text-[11.5px]"
            style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
          >
            Use
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-3 p-3">
      <audio
        ref={audioRef}
        src={source}
        muted={muted}
        preload="none"
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      <div
        className="flex size-14 shrink-0 items-center justify-center rounded-[var(--sas-radius-sm)]"
        style={{ backgroundColor: "var(--sas-surface-sunken)" }}
        aria-hidden="true"
      >
        <IconMusic size={20} stroke={1.4} style={{ color: "var(--sas-text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
          {title}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="sas-numeric text-[10px]" style={{ color: "var(--sas-text-muted)" }}>
            {formatTime(position)}
          </span>
          <div
            className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--sas-line)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: duration > 0 ? `${(position / duration) * 100}%` : "0%",
                backgroundColor: "var(--sas-accent)",
              }}
            />
          </div>
          <span className="sas-numeric text-[10px]" style={{ color: "var(--sas-text-muted)" }}>
            {formatTime(duration)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <IconButton label="Previous" onClick={() => setPosition(0)}>
            <IconPlayerSkipBack size={14} stroke={1.7} />
          </IconButton>
          <IconButton label={playing ? "Pause" : "Play"} onClick={toggle} primary>
            {playing ? <IconPlayerPause size={14} stroke={1.7} /> : <IconPlayerPlay size={14} stroke={1.7} />}
          </IconButton>
          <IconButton label="Next" onClick={() => undefined}>
            <IconPlayerSkipForward size={14} stroke={1.7} />
          </IconButton>
          <IconButton
            label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.muted = !audio.muted;
              setMuted(audio.muted);
            }}
          >
            {muted ? <IconVolumeOff size={14} stroke={1.7} /> : <IconVolume size={14} stroke={1.7} />}
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/** Extracts a YouTube id so the embed can use the no-cookie origin. */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return id;
      const embedMatch = /\/embed\/([\w-]{11})/.exec(url.pathname);
      if (embedMatch) return embedMatch[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoModule({ visible, configuration, onConfigure }: MediaModuleProps) {
  const [draft, setDraft] = useState(configuration["sourceUrl"] ?? "");
  const videoId = parseYouTubeId(configuration["sourceUrl"] ?? "");

  if (!videoId) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-4">
        <p className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
          Video
        </p>
        <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-secondary)" }}>
          Paste a YouTube link to keep a reference beside the work. It stays
          paused and muted until you start it.
        </p>
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = parseYouTubeId(draft);
            if (parsed) onConfigure({ sourceUrl: draft.trim() });
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="YouTube URL"
            aria-label="YouTube URL"
            className="sas-focusable min-w-0 flex-1 rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11.5px] outline-none"
            style={{
              backgroundColor: "var(--sas-surface-sunken)",
              color: "var(--sas-text)",
              border: "1px solid var(--sas-line)",
            }}
          />
          <button
            type="submit"
            className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2.5 text-[11.5px]"
            style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
          >
            Use
          </button>
        </form>
      </div>
    );
  }

  // Unmounting rather than hiding is what actually stops playback and decoding.
  if (!visible) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
          Paused while hidden
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-[var(--sas-radius-sm)]">
      <iframe
        title="Video"
        // no-cookie origin, no autoplay, no related-video harvesting.
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`}
        className="size-full border-0"
        allow="picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  primary,
  children,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="sas-transition sas-focusable rounded-full p-1"
      style={
        primary
          ? { backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }
          : { color: "var(--sas-text-secondary)" }
      }
    >
      {children}
    </button>
  );
}
