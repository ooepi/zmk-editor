import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { IconButton } from './ui/IconButton.tsx';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const STEP = 1.25;
/** Dot spacing at 100%, in px. */
const GRID = 24;

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const HOME: Camera = { x: 0, y: 0, zoom: 1 };
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface CanvasCameraProps {
  /** Zoom and pan are on (the Keymap tab); elsewhere the keyboard just fits. */
  enabled: boolean;
  /** A click on the empty canvas, not on a key (the Combos tab finishes a combo with it). */
  onEmptyClick?: (() => void) | undefined;
  children: ReactNode;
}

/**
 * The keymap canvas with a camera: the wheel zooms toward the pointer, the middle button (or
 * Space + drag) pans, and a small control zooms, fits and turns the dot grid on. The keyboard
 * inside keeps fitting the canvas; the camera scales and moves it from there.
 */
export function CanvasCamera({ enabled, onEmptyClick, children }: CanvasCameraProps) {
  const [camera, setCamera] = useState<Camera>(HOME);
  const { canvasGrid } = usePreferences();
  const canvas = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; from: Camera } | null>(null);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  const cam = enabled ? camera : HOME;

  /** Zooms by `factor`, keeping the point under (clientX, clientY) where it is. */
  const zoomAt = (factor: number, clientX: number, clientY: number) =>
    setCamera((c) => {
      const next = clampZoom(c.zoom * factor);
      const rect = stage.current?.getBoundingClientRect();
      // The stage scales from its top-left corner, which sits at rect.left - c.x before the camera moved it.
      const left = (rect?.left ?? 0) - c.x;
      const top = (rect?.top ?? 0) - c.y;
      const px = clientX - left;
      const py = clientY - top;
      return { zoom: next, x: px - ((px - c.x) * next) / c.zoom, y: py - ((py - c.y) * next) / c.zoom };
    });
  const zoomAtCenter = (factor: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    zoomAt(factor, (rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2);
  };

  // The wheel zooms; the listener isn't passive, so the page doesn't scroll instead.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [enabled]);

  // Space held (outside text fields and buttons) turns a left drag into a pan.
  useEffect(() => {
    if (!enabled) return;
    const ignore = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName));
    const down = (event: KeyboardEvent) => {
      if (event.key !== ' ' || ignore(event.target)) return;
      event.preventDefault();
      space.current = true;
      setPanning(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      space.current = false;
      if (!pan.current) setPanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [enabled]);

  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || !(event.button === 1 || (event.button === 0 && space.current))) return;
    // Before the keyboard sees it: a pan never starts a box select or a key drag.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY, from: camera };
    setPanning(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (p) setCamera({ ...p.from, x: p.from.x + event.clientX - p.x, y: p.from.y + event.clientY - p.y });
  };
  const endPan = () => {
    if (!pan.current) return;
    pan.current = null;
    setPanning(space.current);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (onEmptyClick && (event.target === event.currentTarget || event.target === stage.current)) onEmptyClick();
  };

  const moved = cam.zoom !== 1 || cam.x !== 0 || cam.y !== 0;
  const grid = enabled && canvasGrid;
  return (
    <div
      ref={canvas}
      className={`canvas${grid ? ' dot-grid' : ''}${enabled && panning ? ' panning' : ''}`}
      role="group"
      aria-label="Keymap view"
      style={grid ? { backgroundSize: `${GRID * cam.zoom}px ${GRID * cam.zoom}px`, backgroundPosition: `${cam.x}px ${cam.y}px` } : undefined}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={onClick}
    >
      <div ref={stage} className="camera-stage" style={moved ? { transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` } : undefined}>
        {children}
      </div>
      {enabled && (
        <div className="camera-controls" role="toolbar" aria-label="Zoom">
          <IconButton icon="minus" label="Zoom out" disabled={camera.zoom <= MIN_ZOOM} onClick={() => zoomAtCenter(1 / STEP)} />
          <button
            type="button"
            className="camera-zoom"
            aria-label={`Fit the keyboard (${Math.round(camera.zoom * 100)}%)`}
            title="Fit the keyboard"
            onClick={() => setCamera(HOME)}
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <IconButton icon="plus" label="Zoom in" disabled={camera.zoom >= MAX_ZOOM} onClick={() => zoomAtCenter(STEP)} />
          <span className="camera-divider" aria-hidden="true" />
          <IconButton icon="grid" label="Dot grid" aria-pressed={canvasGrid} onClick={() => setPreferences({ canvasGrid: !canvasGrid })} />
        </div>
      )}
    </div>
  );
}
