import { useEffect, useRef, useState, type RefObject } from "react";

export type FrameSet = {
  /** public path to the folder holding frame-0001.webp ... */
  dir: string;
  /** number of frames in the set */
  count: number;
};

export type FrameScrubOptions = {
  /** the full-bleed canvas that paints the current frame */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** the tall section whose scroll progress drives the frame index */
  scrollRef: RefObject<HTMLElement | null>;
  /** sticky container that receives the --p (0..1) progress custom property */
  progressRef: RefObject<HTMLDivElement | null>;
  /** when false the hook is inert (reduced-motion / low-power static fallback) */
  enabled: boolean;
  desktop: FrameSet;
  mobile: FrameSet;
  /** vertical scroll budget per frame, in px */
  pxPerFrame?: number;
  /** viewport width below which the mobile frame set is used */
  mobileMaxWidth?: number;
};

const framePath = (dir: string, oneBasedIndex: number) =>
  `${dir}/frame-${String(oneBasedIndex).padStart(4, "0")}.webp`;

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cssWidth: number,
  cssHeight: number
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(cssWidth / iw, cssHeight / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cssWidth - dw) / 2;
  const dy = (cssHeight - dh) / 2;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Scroll-scrubbed canvas frame player.
 *
 * The frame set is chosen ONCE on mount (mobile vs desktop) so a window resize
 * never reloads several MB of webp. The scroll listener uses requestAnimationFrame
 * and writes only to the canvas and a single CSS custom property — it never sets
 * React state on the hot path, so the React tree does not re-render while scrolling.
 */
export function useFrameScrub({
  canvasRef,
  scrollRef,
  progressRef,
  enabled,
  desktop,
  mobile,
  pxPerFrame = 12,
  mobileMaxWidth = 768
}: FrameScrubOptions) {
  const [ready, setReady] = useState(false);

  // refs holding mutable per-frame state, kept out of React render
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const loadedRef = useRef<boolean[]>([]);
  const lastDrawnRef = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const section = scrollRef.current;
    if (!canvas) return;

    const set: FrameSet =
      window.innerWidth < mobileMaxWidth ? mobile : desktop;
    const count = set.count;

    // size the tall scroll section so its height controls the scrub length
    if (section) {
      section.style.height = `${count * pxPerFrame + window.innerHeight}px`;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const images: HTMLImageElement[] = new Array(count);
    const loaded: boolean[] = new Array(count).fill(false);
    imagesRef.current = images;
    loadedRef.current = loaded;
    lastDrawnRef.current = -1;

    let cssW = 0;
    let cssH = 0;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resizeCanvas();

    const nearestLoaded = (target: number) => {
      for (let i = target; i >= 0; i--) if (loaded[i]) return i;
      for (let i = target + 1; i < count; i++) if (loaded[i]) return i;
      return -1;
    };

    const paint = (index: number) => {
      const src = loaded[index] ? index : nearestLoaded(index);
      if (src < 0) return;
      drawCover(ctx, images[src], cssW, cssH);
      lastDrawnRef.current = index;
    };

    const computeProgress = () => {
      if (!section) return 0;
      const rect = section.getBoundingClientRect();
      const travel = section.offsetHeight - window.innerHeight;
      if (travel <= 0) return 0;
      const p = -rect.top / travel;
      return Math.min(1, Math.max(0, p));
    };

    let frameRequested = false;
    const render = () => {
      frameRequested = false;
      const progress = computeProgress();
      if (progressRef.current) {
        progressRef.current.style.setProperty("--p", progress.toFixed(4));
      }
      const index = Math.min(count - 1, Math.round(progress * (count - 1)));
      if (index !== lastDrawnRef.current) paint(index);
    };

    const requestRender = () => {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(render);
    };

    const onResize = () => {
      if (section) {
        section.style.height = `${count * pxPerFrame + window.innerHeight}px`;
      }
      resizeCanvas();
      // force a repaint of the current frame at the new size
      const last = lastDrawnRef.current;
      lastDrawnRef.current = -1;
      if (last >= 0) paint(last);
      requestRender();
    };

    // --- progressive preload: first frames eager, the rest in the background ---
    const EAGER = 10;
    const loadFrame = (i: number, onLoad?: () => void) => {
      if (images[i]) return;
      const img = new Image();
      img.decoding = "async";
      img.src = framePath(set.dir, i + 1);
      img.onload = () => {
        loaded[i] = true;
        onLoad?.();
        // if scroll already reached an unpainted frame, catch up
        if (i >= lastDrawnRef.current && !frameRequested) requestRender();
      };
      images[i] = img;
    };

    // frame 0 first so the hero paints immediately
    loadFrame(0, () => {
      if (lastDrawnRef.current < 0) paint(0);
      setReady(true);
    });
    for (let i = 1; i < Math.min(EAGER, count); i++) loadFrame(i);

    let bg = EAGER;
    const pumpBackground = () => {
      const BATCH = 12;
      for (let n = 0; n < BATCH && bg < count; n++, bg++) loadFrame(bg);
      if (bg < count) {
        if ("requestIdleCallback" in window) {
          (window as Window & typeof globalThis).requestIdleCallback(
            pumpBackground
          );
        } else {
          setTimeout(pumpBackground, 32);
        }
      }
    };
    pumpBackground();

    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", onResize);
    requestRender();

    return () => {
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", onResize);
      images.forEach((img) => {
        if (img) img.onload = null;
      });
      imagesRef.current = [];
      loadedRef.current = [];
    };
  }, [
    enabled,
    canvasRef,
    scrollRef,
    progressRef,
    desktop,
    mobile,
    pxPerFrame,
    mobileMaxWidth
  ]);

  return { ready };
}
