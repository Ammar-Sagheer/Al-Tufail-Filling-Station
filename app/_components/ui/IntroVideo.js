'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The pump's own intro clip, over the app on every full load: opening it, or a
 * refresh (Al Tufail, October 2026). Set by INTRO_VIDEO in pump-settings.js;
 * nothing renders without it.
 *
 * IN THE ROOT LAYOUT, so it is drawn by the server in the first response and
 * covers the page from the first paint, rather than the app flashing up and
 * then being covered. A layout is not remounted when a link is followed, so it
 * plays on a load or a refresh and never between pages, which is what was
 * asked for.
 *
 * IT CAN ALWAYS BE GOT PAST. Skip is there from the first frame, it ends itself
 * when the clip ends, and it lets go if the file fails to load or never starts
 * (a timer, in case the browser simply sits on it). Staff entering readings at
 * the change of shift must never be held up by it.
 *
 * MUTED TO START, because a browser refuses to autoplay a video with sound;
 * the sound button turns it on with the tap the browser wants first.
 */
export default function IntroVideo({ src }) {
  // One path, or several (a WebM first, then the MP4): the browser plays the
  // first it can, and fetches only that one.
  const sources = Array.isArray(src) ? src : [src];
  const [shown, setShown] = useState(true);
  const [muted, setMuted] = useState(true);
  const video = useRef(null);

  useEffect(() => {
    if (!shown) return undefined;
    // Whatever the clip does, the app is free after 20 seconds.
    const timer = setTimeout(() => setShown(false), 20_000);
    const element = video.current;
    element?.play?.().catch(() => setShown(false));
    return () => clearTimeout(timer);
  }, [shown]);

  if (!sources[0] || !shown) return null;

  return (
    <div
      role="dialog"
      aria-label="Intro"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black"
    >
      <video
        ref={video}
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        onEnded={() => setShown(false)}
        onError={() => setShown(false)}
        className="h-full w-full object-contain"
      >
        {sources.map((path) => (
          <source
            key={path}
            src={path}
            type={path.endsWith('.webm') ? 'video/webm' : 'video/mp4'}
            // The last source failing is the clip failing.
            onError={path === sources[sources.length - 1] ? () => setShown(false) : undefined}
          />
        ))}
      </video>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-4 sm:p-6">
        <button
          type="button"
          onClick={() => {
            setMuted((value) => !value);
            if (video.current) video.current.muted = !muted;
          }}
          className="min-h-11 rounded-xl bg-white/15 px-4 py-2 text-base font-semibold text-white backdrop-blur hover:bg-white/25"
        >
          {muted ? 'Sound on' : 'Sound off'}
        </button>
        <button
          type="button"
          onClick={() => setShown(false)}
          autoFocus
          className="min-h-11 rounded-xl bg-white px-5 py-2 text-base font-bold text-ink-900 hover:bg-ink-100"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
