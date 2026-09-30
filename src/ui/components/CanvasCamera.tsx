import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';
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
/** Less than this share of the keyboard on screen counts as lost. */
const LOST = 0.15;
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
  /** The keyboard is (nearly) out of view: offer to bring it back. */
  const [lost, setLost] = useState(false);

  // After the camera moves (and the page has drawn it), check how much of the keyboard still shows.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const area = canvas.current?.getBoundingClientRect();
      const board = canvas.current?.querySelector('.keyboard')?.getBoundingClientRect();
      if (!enabled || !area || !board || area.width === 0 || board.width * board.height === 0) {
        setLost(false);
        return;
      }
      const w = Math.max(0, Math.min(area.right, board.right) - Math.max(area.left, board.left));
      const h = Math.max(0, Math.min(area.bottom, board.bottom) - Math.max(area.top, board.top));
      setLost((w * h) / (board.width * board.height) < LOST);
    });
    return () => cancelAnimationFrame(frame);
  }, [camera, enabled]);

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
      {enabled && lost && (
        <button type="button" className="camera-lost" onClick={() => setCamera(HOME)}>
          <Icon name="focus" size={16} />
          Lost the keyboard? Bring it back
        </button>
      )}
      {enabled && (
        <div className="camera-controls" role="toolbar" aria-label="Zoom">
          <IconButton icon="minus" label="Zoom out" disabled={camera.zoom <= MIN_ZOOM} onClick={() => zoomAtCenter(1 / STEP)} />
          <span className="camera-zoom" aria-live="polite">
            {Math.round(camera.zoom * 100)}%
          </span>
          <IconButton icon="plus" label="Zoom in" disabled={camera.zoom >= MAX_ZOOM} onClick={() => zoomAtCenter(STEP)} />
          <span className="camera-divider" aria-hidden="true" />
          <IconButton icon="focus" label="Fit keyboard" title="Fit the keyboard in view" onClick={() => setCamera(HOME)} />
          <IconButton icon="grid" label="Dot grid" aria-pressed={canvasGrid} onClick={() => setPreferences({ canvasGrid: !canvasGrid })} />
        </div>
      )}
    </div>
  );
}
