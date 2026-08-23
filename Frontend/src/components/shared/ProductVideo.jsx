import React, { useRef, useState } from 'react';
import { Play, VideoOff } from 'lucide-react';

/**
 * Product gallery video player.
 *
 * Deliberately the browser's own `controls` rather than a custom control bar:
 * play/pause, scrubbing, volume, fullscreen, picture-in-picture, playback speed
 * and captions all arrive for free, already keyboard-accessible, already
 * translated, and already behaving the way the buyer's phone behaves elsewhere.
 * A hand-rolled bar would be a worse copy of that, and every wholesale buyer
 * opening this page on a phone is the wrong audience to experiment on.
 *
 * What is added on top is the one thing `controls` does not give: a poster and
 * a large tap target before first play. `controls` renders a small play button
 * that is easy to miss on a 24 px-tall control bar, and a video with no visible
 * affordance reads as a broken image.
 *
 * Props:
 *   sources   [{ src, type }] in browser-preference order (WebM then MP4)
 *   poster    still frame shown before playback
 *   title     used as the accessible name — pass the asset's alt text
 *   autoPlay  muted autoplay, for a gallery that opens straight onto a video
 */
export default function ProductVideo({ sources = [], poster, title = '', autoPlay = false, className = '' }) {
  const videoRef = useRef(null);
  const [started, setStarted] = useState(autoPlay);
  const [failed, setFailed] = useState(false);

  if (!sources.length || failed) {
    return (
      <div className={`w-full aspect-square rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/5 flex flex-col items-center justify-center gap-2 ${className}`}>
        <VideoOff className="w-12 h-12 text-gray-300 dark:text-zinc-700" />
        <p className="text-xs text-gray-400 dark:text-zinc-500">This video could not be played.</p>
      </div>
    );
  }

  const start = () => {
    setStarted(true);
    videoRef.current?.play();
  };

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-black border border-gray-200 dark:border-white/5 aspect-square shadow-sm ${className}`}>
      <video
        ref={videoRef}
        // object-contain, not cover: a garment clip is usually portrait or 16:9
        // and cropping it to the square stage is how the product ends up out of
        // frame. Letterboxing against black is the honest fit.
        className="w-full h-full object-contain bg-black"
        poster={poster}
        controls
        // Without playsInline, iOS Safari takes the video fullscreen the moment
        // it starts — leaving the gallery, the swatches and the price table.
        playsInline
        // metadata, not auto: the buyer came for the photos, and preloading a
        // multi-megabyte clip they may never open competes with the LCP image
        // for bandwidth on exactly the mobile connections that can least afford
        // it. The poster is already showing, so there is nothing to wait for.
        preload="metadata"
        autoPlay={autoPlay}
        muted={autoPlay}
        loop={autoPlay}
        aria-label={title || 'Product video'}
        onPlay={() => setStarted(true)}
        onError={() => setFailed(true)}
      >
        {sources.map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </video>

      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label={title ? `Play video: ${title}` : 'Play video'}
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors group"
        >
          <span className="w-16 h-16 rounded-full bg-white/90 group-hover:bg-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-105">
            {/* Nudged right: a triangle centred on its bounding box reads as
                off-centre inside a circle. */}
            <Play className="w-7 h-7 text-gray-900 fill-gray-900 ml-1" />
          </span>
        </button>
      )}
    </div>
  );
}
