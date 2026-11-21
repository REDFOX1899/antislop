'use client';

import { useEffect, useRef } from 'react';

export type CobaltCubeVariant = 'hero' | 'wireframe' | 'monitor' | 'code';

export interface CobaltCube3DProps {
  variant?: CobaltCubeVariant;
  theme?: 'dark' | 'light';
  className?: string;
  size?: number;
  ariaLabel?: string;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

interface FaceDef {
  indices: [number, number, number, number]; // [TL, TR, BR, BL] viewed from outside
}

// Unit cube vertices in right-handed space (+x right, +y up, +z toward viewer)
const CUBE_VERTICES: Vec3[] = [
  { x: -1, y: -1, z: -1 }, // 0
  { x: 1, y: -1, z: -1 },  // 1
  { x: 1, y: 1, z: -1 },   // 2
  { x: -1, y: 1, z: -1 },  // 3
  { x: -1, y: -1, z: 1 },  // 4
  { x: 1, y: -1, z: 1 },   // 5
  { x: 1, y: 1, z: 1 },    // 6
  { x: -1, y: 1, z: 1 },   // 7
];

// Faces ordered [TL, TR, BR, BL] from outside so cross(v3 - v0, v1 - v0) points outward
const CUBE_FACES: FaceDef[] = [
  { indices: [7, 6, 5, 4] }, // Front (+z)
  { indices: [2, 3, 0, 1] }, // Back (-z)
  { indices: [6, 2, 1, 5] }, // Right (+x)
  { indices: [3, 7, 4, 0] }, // Left (-x)
  { indices: [3, 2, 6, 7] }, // Top (+y)
  { indices: [4, 5, 1, 0] }, // Bottom (-y)
];

const CUBE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const CODE_SNIPPET_LINES = [
  'const taste = gemini4.direct({',
  '  surface: "obsidian",',
  '  slopPenalty: "< 1.8",',
  '  decisions: "calibrated",',
  '  craft: "verified",',
  '});',
];

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rotatePoint(v: Vec3, rx: number, ry: number, rz: number, scale: number): Vec3 {
  const x0 = v.x * scale;
  const y0 = v.y * scale;
  const z0 = v.z * scale;

  // Rotate around Y
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = x0 * cy + z0 * sy;
  const z1 = -x0 * sy + z0 * cy;

  // Rotate around X
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y2 = y0 * cx - z1 * sx;
  const z2 = y0 * sx + z1 * cx;

  // Rotate around Z
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x3 = x1 * cz - y2 * sz;
  const y3 = x1 * sz + y2 * cz;

  return { x: x3, y: y3, z: z2 };
}

function projectPoint(
  v: Vec3,
  cx: number,
  cy: number,
  focal: number,
  cameraZ: number
): ProjectedPoint {
  const depth = Math.max(1.2, cameraZ - v.z);
  const scale = focal / depth;
  return {
    x: cx + v.x * scale,
    y: cy - v.y * scale,
    z: v.z,
    scale,
  };
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

const KEY_LIGHT = normalize({ x: -0.45, y: 0.72, z: 0.68 });
const FLOOR_BOUNCE_LIGHT = normalize({ x: 0.2, y: -0.85, z: 0.48 });

export function CobaltCube3D({
  variant = 'hero',
  theme = 'dark',
  className = '',
  size = 1,
  ariaLabel = 'Interactive 3D Cobalt Glass Cube representing AntiSlop multimodal vision',
}: CobaltCube3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLight = theme === 'light';
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let rafId = 0;

    let width = container.clientWidth || 360;
    let height = container.clientHeight || 320;
    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(160, Math.round(rect.width));
      height = Math.max(160, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) renderFrame(0);
    });
    resizeObserver.observe(container);

    // Pause animation smoothly when offscreen
    let isVisible = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 }
    );
    intersectionObserver.observe(container);

    // Subtle smoothed cursor parallax tilt
    const pointer = { targetX: 0, targetY: 0, x: 0, y: 0 };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.targetX = Math.max(-1, Math.min(1, nx));
      pointer.targetY = Math.max(-1, Math.min(1, ny));
    };

    const handlePointerLeave = () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
    };

    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave, { passive: true });

    const drawWireframeBackdrop = (
      cx: number,
      cy: number,
      unit: number,
      px: number,
      py: number,
      t: number
    ) => {
      ctx.save();
      const shiftX = -px * 14;
      const shiftY = -py * 10;

      // Subtle architectural blueprint grid fading radially
      const gridAlpha = isLight ? 0.08 : 0.11;
      ctx.strokeStyle = isLight
        ? `rgba(26, 115, 232, ${gridAlpha})`
        : `rgba(102, 157, 246, ${gridAlpha})`;
      ctx.lineWidth = 1;
      const step = Math.max(28, Math.round(unit * 0.24));
      const halfW = unit * 1.95;
      const halfH = unit * 1.35;

      for (let gx = -halfW; gx <= halfW; gx += step) {
        const distFade = Math.max(0, 1 - Math.abs(gx) / halfW);
        ctx.globalAlpha = distFade * 0.65;
        ctx.beginPath();
        ctx.moveTo(cx + shiftX * 0.35 + gx, cy + shiftY * 0.35 - halfH * 0.8);
        ctx.lineTo(cx + shiftX * 0.35 + gx, cy + shiftY * 0.35 + halfH * 0.8);
        ctx.stroke();
      }
      for (let gy = -halfH; gy <= halfH; gy += step) {
        const distFade = Math.max(0, 1 - Math.abs(gy) / halfH);
        ctx.globalAlpha = distFade * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx + shiftX * 0.35 - halfW * 0.9, cy + shiftY * 0.35 + gy);
        ctx.lineTo(cx + shiftX * 0.35 + halfW * 0.9, cy + shiftY * 0.35 + gy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Left floating UI layout card silhouette
      const card1W = unit * 1.25;
      const card1H = unit * 0.86;
      const card1X = cx - unit * 1.62 + shiftX * 0.8;
      const card1Y = cy - unit * 0.72 + shiftY * 0.8 + Math.sin(t * 0.9) * 2.5;

      drawRoundedRectPath(ctx, card1X, card1Y, card1W, card1H, 12);
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.05)'
        : 'rgba(11, 87, 208, 0.13)';
      ctx.fill();
      ctx.strokeStyle = isLight
        ? 'rgba(26, 115, 232, 0.24)'
        : 'rgba(102, 157, 246, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Header pills inside left UI card
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.2)'
        : 'rgba(138, 180, 248, 0.26)';
      drawRoundedRectPath(ctx, card1X + 12, card1Y + 12, card1W * 0.42, 7, 3.5);
      ctx.fill();
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.11)'
        : 'rgba(102, 157, 246, 0.16)';
      drawRoundedRectPath(ctx, card1X + 12, card1Y + 26, card1W * 0.72, 5, 2.5);
      ctx.fill();
      drawRoundedRectPath(ctx, card1X + 12, card1Y + 36, card1W * 0.56, 5, 2.5);
      ctx.fill();
      drawRoundedRectPath(
        ctx,
        card1X + 12,
        card1Y + 50,
        card1W - 24,
        card1H - 62,
        7
      );
      ctx.strokeStyle = isLight
        ? 'rgba(26, 115, 232, 0.16)'
        : 'rgba(102, 157, 246, 0.2)';
      ctx.stroke();

      // Right floating Inspector / Component card silhouette
      const card2W = unit * 1.18;
      const card2H = unit * 0.92;
      const card2X = cx + unit * 0.48 + shiftX * 1.05;
      const card2Y = cy - unit * 0.12 + shiftY * 0.95 + Math.cos(t * 0.85) * 2.5;

      drawRoundedRectPath(ctx, card2X, card2Y, card2W, card2H, 12);
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.045)'
        : 'rgba(11, 87, 208, 0.11)';
      ctx.fill();
      ctx.strokeStyle = isLight
        ? 'rgba(26, 115, 232, 0.22)'
        : 'rgba(102, 157, 246, 0.26)';
      ctx.stroke();

      // Mini columns inside right UI card
      const colW = (card2W - 30) / 2;
      drawRoundedRectPath(ctx, card2X + 12, card2Y + 14, colW, card2H * 0.44, 6);
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.1)'
        : 'rgba(66, 133, 244, 0.15)';
      ctx.fill();
      drawRoundedRectPath(
        ctx,
        card2X + 18 + colW,
        card2Y + 14,
        colW,
        card2H * 0.44,
        6
      );
      ctx.fill();
      drawRoundedRectPath(
        ctx,
        card2X + 12,
        card2Y + card2H * 0.68,
        card2W * 0.62,
        6,
        3
      );
      ctx.fillStyle = isLight
        ? 'rgba(26, 115, 232, 0.18)'
        : 'rgba(138, 180, 248, 0.22)';
      ctx.fill();

      // Subtle dashed Cobalt annotation circle echoing "Circle & speak to your live UI"
      const ringX = card1X + card1W * 0.62;
      const ringY = card1Y + card1H * 0.64;
      const ringRx = unit * 0.44;
      const ringRy = unit * 0.25;
      ctx.save();
      ctx.translate(ringX, ringY);
      ctx.rotate(-0.14);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = isLight
        ? 'rgba(26, 115, 232, 0.55)'
        : 'rgba(138, 180, 248, 0.62)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRx, ringRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    };

    const drawMonitorStageBackdrop = (
      cx: number,
      cy: number,
      unit: number,
      px: number,
      py: number
    ) => {
      ctx.save();
      const shiftX = -px * 8;
      const shiftY = -py * 6;

      // Delicate calibrated concentric studio rings
      const rings = [unit * 1.15, unit * 1.65, unit * 2.2];
      rings.forEach((radius, idx) => {
        ctx.beginPath();
        ctx.ellipse(
          cx + shiftX * 0.4,
          cy + unit * 0.12 + shiftY * 0.4,
          radius,
          radius * 0.44,
          0,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = isLight
          ? `rgba(26, 115, 232, ${0.12 - idx * 0.03})`
          : `rgba(102, 157, 246, ${0.15 - idx * 0.038})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Subtle crosshair horizon hairlines
      const lineGrad = ctx.createLinearGradient(cx - unit * 2.6, cy, cx + unit * 2.6, cy);
      lineGrad.addColorStop(0, 'rgba(66, 133, 244, 0)');
      lineGrad.addColorStop(
        0.5,
        isLight ? 'rgba(26, 115, 232, 0.16)' : 'rgba(138, 180, 248, 0.18)'
      );
      lineGrad.addColorStop(1, 'rgba(66, 133, 244, 0)');
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - unit * 2.6, cy + unit * 0.12);
      ctx.lineTo(cx + unit * 2.6, cy + unit * 0.12);
      ctx.stroke();

      ctx.restore();
    };

    const drawFaceCodeOverlay = (
      p0: ProjectedPoint,
      p1: ProjectedPoint,
      p3: ProjectedPoint,
      alpha: number
    ) => {
      ctx.save();
      // Affine map [0..100, 0..100] onto face quad [TL=p0, TR=p1, BL=p3]
      ctx.transform(
        (p1.x - p0.x) / 100,
        (p1.y - p0.y) / 100,
        (p3.x - p0.x) / 100,
        (p3.y - p0.y) / 100,
        p0.x,
        p0.y
      );

      ctx.font = '500 5.4px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';

      CODE_SNIPPET_LINES.forEach((line, i) => {
        ctx.fillStyle = isLight
          ? `rgba(11, 87, 208, ${alpha * (i === 0 || i === 5 ? 0.65 : 0.9)})`
          : `rgba(196, 222, 255, ${alpha * (i === 0 || i === 5 ? 0.62 : 0.88)})`;
        ctx.fillText(line, 9, 16 + i * 11.5);
      });
      ctx.restore();
    };

    const renderCubeShell = (
      cx: number,
      cy: number,
      focal: number,
      cameraZ: number,
      rx: number,
      ry: number,
      rz: number,
      cubeScale: number,
      isInnerCore: boolean,
      t: number,
      facePass: 'all' | 'back' | 'front' = 'all'
    ) => {
      const worldVerts = CUBE_VERTICES.map((v) =>
        rotatePoint(v, rx, ry, rz, cubeScale)
      );
      const projVerts = worldVerts.map((v) =>
        projectPoint(v, cx, cy, focal, cameraZ)
      );

      interface PreparedFace {
        indices: [number, number, number, number];
        avgZ: number;
        normal: Vec3;
        frontFacing: boolean;
        viewDot: number;
      }

      const faces: PreparedFace[] = CUBE_FACES.map((face) => {
        const [i0, i1, i2, i3] = face.indices;
        const v0 = worldVerts[i0];
        const v1 = worldVerts[i1];
        const v2 = worldVerts[i2];
        const v3 = worldVerts[i3];

        const center: Vec3 = {
          x: (v0.x + v1.x + v2.x + v3.x) * 0.25,
          y: (v0.y + v1.y + v2.y + v3.y) * 0.25,
          z: (v0.z + v1.z + v2.z + v3.z) * 0.25,
        };

        const normal = normalize(cross(sub(v3, v0), sub(v1, v0)));
        const toCamera = normalize({
          x: -center.x,
          y: -center.y,
          z: cameraZ - center.z,
        });
        const viewDot = dot(normal, toCamera);

        return {
          indices: face.indices,
          avgZ: center.z,
          normal,
          frontFacing: viewDot > 0,
          viewDot,
        };
      });

      // Painter's algorithm back-to-front depth sort
      faces.sort((a, b) => a.avgZ - b.avgZ);

      // Identify clearest front-facing face for optional code projection
      let primaryFrontIdx = -1;
      if (!isInnerCore && facePass !== 'back' && variant === 'code') {
        let bestDot = 0.25;
        faces.forEach((f, idx) => {
          if (f.viewDot > bestDot) {
            bestDot = f.viewDot;
            primaryFrontIdx = idx;
          }
        });
      }

      faces.forEach((face, idx) => {
        if (facePass === 'back' && face.frontFacing) return;
        if (facePass === 'front' && !face.frontFacing) return;

        const [i0, i1, i2, i3] = face.indices;
        const p0 = projVerts[i0];
        const p1 = projVerts[i1];
        const p2 = projVerts[i2];
        const p3 = projVerts[i3];

        const keyDiffuse = Math.max(0, dot(face.normal, KEY_LIGHT));
        const bounceDiffuse = Math.max(0, dot(face.normal, FLOOR_BOUNCE_LIGHT));
        const fresnel = Math.pow(1 - Math.min(1, Math.abs(face.viewDot)), 1.65);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();

        // Directional cobalt glass facet gradient
        const grad = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);

        if (isInnerCore) {
          const baseAlpha = face.frontFacing
            ? isLight
              ? 0.24
              : 0.34
            : isLight
            ? 0.11
            : 0.16;
          grad.addColorStop(0, `rgba(66, 133, 244, ${baseAlpha + keyDiffuse * 0.18})`);
          grad.addColorStop(0.55, `rgba(26, 115, 232, ${baseAlpha + 0.1})`);
          grad.addColorStop(1, `rgba(11, 87, 208, ${baseAlpha + 0.2})`);
        } else if (face.frontFacing) {
          const topAlpha = (isLight ? 0.24 : 0.2) + keyDiffuse * 0.22 + fresnel * 0.18;
          const midAlpha = (isLight ? 0.17 : 0.14) + fresnel * 0.13;
          const botAlpha = (isLight ? 0.3 : 0.32) + bounceDiffuse * 0.18;

          grad.addColorStop(
            0,
            keyDiffuse > 0.45
              ? `rgba(138, 180, 248, ${Math.min(0.66, topAlpha)})`
              : `rgba(102, 157, 246, ${Math.min(0.56, topAlpha)})`
          );
          grad.addColorStop(0.48, `rgba(26, 115, 232, ${Math.min(0.48, midAlpha)})`);
          grad.addColorStop(1, `rgba(11, 87, 208, ${Math.min(0.64, botAlpha)})`);
        } else {
          // Back-facing interior glass facets
          const backAlpha = isLight ? 0.15 : 0.22;
          grad.addColorStop(0, `rgba(11, 87, 208, ${backAlpha + 0.1})`);
          grad.addColorStop(0.6, `rgba(26, 115, 232, ${backAlpha})`);
          grad.addColorStop(1, `rgba(66, 133, 244, ${backAlpha * 0.72})`);
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Diagonal optical glass sheen across bright front faces
        if (!isInnerCore && face.frontFacing && keyDiffuse > 0.12) {
          ctx.save();
          ctx.clip();
          const sweepOffset = reducedMotion ? 0.35 : (Math.sin(t * 0.55 + idx) * 0.22 + 0.35);
          const sx0 = p0.x + (p2.x - p0.x) * (sweepOffset - 0.28);
          const sy0 = p0.y + (p2.y - p0.y) * (sweepOffset - 0.28);
          const sx1 = p0.x + (p2.x - p0.x) * (sweepOffset + 0.32);
          const sy1 = p0.y + (p2.y - p0.y) * (sweepOffset + 0.32);

          const sheen = ctx.createLinearGradient(sx0, sy0, sx1, sy1);
          const sheenPeak = (isLight ? 0.24 : 0.18) * (0.45 + keyDiffuse * 0.75);
          sheen.addColorStop(0, 'rgba(138, 180, 248, 0)');
          sheen.addColorStop(0.45, `rgba(210, 227, 252, ${sheenPeak})`);
          sheen.addColorStop(0.55, `rgba(255, 255, 255, ${sheenPeak * 0.85})`);
          sheen.addColorStop(1, 'rgba(138, 180, 248, 0)');
          ctx.fillStyle = sheen;
          ctx.fill();
          ctx.restore();
        }

        // Affine-projected JSX/CSS code lines on front-most face in 'code' variant
        if (idx === primaryFrontIdx && face.viewDot > 0.32) {
          drawFaceCodeOverlay(p0, p1, p3, Math.min(1, (face.viewDot - 0.22) * 1.4));
        }

        // Crisp translucent facet edge stroke
        ctx.strokeStyle = isInnerCore
          ? isLight
            ? 'rgba(26, 115, 232, 0.34)'
            : 'rgba(102, 157, 246, 0.38)'
          : face.frontFacing
          ? isLight
            ? `rgba(26, 115, 232, ${0.48 + fresnel * 0.34})`
            : `rgba(138, 180, 248, ${0.44 + fresnel * 0.44})`
          : isLight
          ? 'rgba(26, 115, 232, 0.18)'
          : 'rgba(66, 133, 244, 0.24)';
        ctx.lineWidth = isInnerCore ? 0.85 : face.frontFacing ? 1.15 : 0.8;
        ctx.stroke();

        ctx.restore();
      });

      // Outer cube crisp luminous wireframe highlight + specular vertex glints
      if (!isInnerCore && facePass !== 'back') {
        ctx.save();
        CUBE_EDGES.forEach(([a, b]) => {
          const va = worldVerts[a];
          const vb = worldVerts[b];
          const pa = projVerts[a];
          const pb = projVerts[b];
          const midZ = (va.z + vb.z) * 0.5;
          if (midZ < -0.2) return;

          const prominence = Math.max(0, Math.min(1, (midZ + 0.3) / 1.45));
          const edgeGrad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
          edgeGrad.addColorStop(
            0,
            isLight
              ? `rgba(26, 115, 232, ${0.28 + prominence * 0.48})`
              : `rgba(138, 180, 248, ${0.28 + prominence * 0.58})`
          );
          edgeGrad.addColorStop(
            0.5,
            isLight
              ? `rgba(66, 133, 244, ${0.4 + prominence * 0.44})`
              : `rgba(196, 222, 255, ${0.36 + prominence * 0.52})`
          );
          edgeGrad.addColorStop(
            1,
            isLight
              ? `rgba(26, 115, 232, ${0.28 + prominence * 0.48})`
              : `rgba(102, 157, 246, ${0.28 + prominence * 0.58})`
          );

          ctx.strokeStyle = edgeGrad;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        });

        // Pin-sharp #8AB4F8 corner specular highlights on front-most vertices
        projVerts.forEach((p, idx) => {
          const vz = worldVerts[idx].z;
          if (vz < 0.25) return;
          const intensity = Math.min(1, (vz - 0.15) / 1.35);
          const glintR = 7 + intensity * 7.5;

          const glint = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glintR);
          glint.addColorStop(
            0,
            isLight
              ? `rgba(255, 255, 255, ${0.92 * intensity})`
              : `rgba(232, 240, 254, ${0.96 * intensity})`
          );
          glint.addColorStop(
            0.3,
            `rgba(138, 180, 248, ${0.65 * intensity})`
          );
          glint.addColorStop(1, 'rgba(66, 133, 244, 0)');
          ctx.fillStyle = glint;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glintR, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }
    };

    const renderFrame = (elapsedSec: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Smooth cursor parallax easing
      const ease = reducedMotion ? 0.12 : 0.065;
      pointer.x += (pointer.targetX - pointer.x) * ease;
      pointer.y += (pointer.targetY - pointer.y) * ease;

      const minDim = Math.min(width, height);
      const variantMultiplier =
        variant === 'hero'
          ? 0.295
          : variant === 'wireframe'
          ? 0.255
          : variant === 'monitor'
          ? 0.265
          : 0.28;
      const unit = minDim * variantMultiplier * size;
      const focal = unit * 3.85;
      const cameraZ = 4.75;

      const bobY = reducedMotion ? 0 : Math.sin(elapsedSec * 1.15) * (minDim * 0.018);
      const cx = width * 0.5;
      const cy =
        height * (variant === 'hero' ? 0.455 : variant === 'monitor' ? 0.46 : 0.49) +
        bobY;

      // 1. Deep Google Cobalt Ambient Halo + Floor Reflection Aura
      const haloRadius = unit * (variant === 'hero' ? 2.45 : 2.15);
      const ambientHalo = ctx.createRadialGradient(
        cx,
        cy + unit * 0.08,
        unit * 0.1,
        cx,
        cy + unit * 0.08,
        haloRadius
      );
      if (isLight) {
        ambientHalo.addColorStop(0, 'rgba(26, 115, 232, 0.16)');
        ambientHalo.addColorStop(0.42, 'rgba(66, 133, 244, 0.07)');
        ambientHalo.addColorStop(0.75, 'rgba(138, 180, 248, 0.025)');
        ambientHalo.addColorStop(1, 'rgba(66, 133, 244, 0)');
      } else {
        ambientHalo.addColorStop(0, 'rgba(11, 87, 208, 0.44)');
        ambientHalo.addColorStop(0.38, 'rgba(26, 115, 232, 0.22)');
        ambientHalo.addColorStop(0.7, 'rgba(66, 133, 244, 0.065)');
        ambientHalo.addColorStop(1, 'rgba(11, 87, 208, 0)');
      }
      ctx.fillStyle = ambientHalo;
      ctx.beginPath();
      ctx.arc(cx, cy + unit * 0.08, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // Elliptical luminous Cobalt floor reflection beneath floating cube
      const floorY =
        height * (variant === 'hero' ? 0.805 : variant === 'monitor' ? 0.81 : 0.82);
      const floorScale = 1 - (bobY / Math.max(1, minDim)) * 1.6;
      const floorRx = unit * 1.48 * floorScale;
      const floorRy = unit * 0.34 * floorScale;

      ctx.save();
      ctx.translate(cx, floorY);
      ctx.scale(1, floorRy / Math.max(1, floorRx));
      const floorGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, floorRx);
      if (isLight) {
        floorGrad.addColorStop(0, 'rgba(11, 87, 208, 0.24)');
        floorGrad.addColorStop(0.45, 'rgba(26, 115, 232, 0.1)');
        floorGrad.addColorStop(1, 'rgba(26, 115, 232, 0)');
      } else {
        floorGrad.addColorStop(0, 'rgba(26, 115, 232, 0.46)');
        floorGrad.addColorStop(0.38, 'rgba(11, 87, 208, 0.24)');
        floorGrad.addColorStop(0.72, 'rgba(66, 133, 244, 0.07)');
        floorGrad.addColorStop(1, 'rgba(11, 87, 208, 0)');
      }
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.arc(0, 0, floorRx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Variant-specific architectural backdrop motifs
      if (variant === 'wireframe') {
        drawWireframeBackdrop(cx, cy - bobY * 0.4, unit, pointer.x, pointer.y, elapsedSec);
      } else if (variant === 'monitor') {
        drawMonitorStageBackdrop(cx, cy - bobY * 0.3, unit, pointer.x, pointer.y);
      }

      // 3. Rotation angles (serene isometric resting pose + gentle smooth orbit + cursor parallax)
      const baseRx = variant === 'wireframe' ? 0.46 : 0.52;
      const baseRy = variant === 'code' ? -0.44 : 0.68;
      const baseRz = variant === 'hero' ? -0.06 : 0.04;

      const animRy = reducedMotion ? 0 : elapsedSec * 0.34;
      const animRx = reducedMotion ? 0 : Math.sin(elapsedSec * 0.48) * 0.11;
      const animRz = reducedMotion ? 0 : Math.cos(elapsedSec * 0.36) * 0.045;

      const rx = baseRx + animRx - pointer.y * 0.26;
      const ry = baseRy + animRy + pointer.x * 0.32;
      const rz = baseRz + animRz;

      // 4. 3-Layer Optical Glass Sandwich:
      //    (a) Outer back-facing glass shell
      renderCubeShell(
        cx,
        cy,
        focal,
        cameraZ,
        rx,
        ry,
        rz,
        1.0,
        false,
        elapsedSec,
        'back'
      );

      //    (b) Volumetric Cobalt Core Glow + Suspended Inner Refractive Prism
      const coreGlowR = unit * 0.92;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlowR);
      if (isLight) {
        coreGlow.addColorStop(0, 'rgba(26, 115, 232, 0.28)');
        coreGlow.addColorStop(0.5, 'rgba(66, 133, 244, 0.1)');
        coreGlow.addColorStop(1, 'rgba(66, 133, 244, 0)');
      } else {
        coreGlow.addColorStop(0, 'rgba(26, 115, 232, 0.56)');
        coreGlow.addColorStop(0.45, 'rgba(11, 87, 208, 0.28)');
        coreGlow.addColorStop(1, 'rgba(11, 87, 208, 0)');
      }
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreGlowR, 0, Math.PI * 2);
      ctx.fill();

      renderCubeShell(
        cx,
        cy,
        focal,
        cameraZ,
        rx + 0.08,
        ry - 0.14,
        rz,
        0.54,
        true,
        elapsedSec,
        'all'
      );

      //    (c) Outer Front Specular Glass Facets + Luminous Edges + Corner Glints
      renderCubeShell(
        cx,
        cy,
        focal,
        cameraZ,
        rx,
        ry,
        rz,
        1.0,
        false,
        elapsedSec,
        'front'
      );

      // 6. Calm sparse orbiting specular dust motes (hero & monitor only)
      if (variant === 'hero' || variant === 'monitor') {
        const motes = 6;
        for (let i = 0; i < motes; i++) {
          const angle = (i / motes) * Math.PI * 2 + (reducedMotion ? 0.3 : elapsedSec * 0.18);
          const orbitRx = unit * (1.35 + (i % 2) * 0.32);
          const orbitRy = unit * (0.58 + (i % 3) * 0.18);
          const mx = cx + Math.cos(angle) * orbitRx + pointer.x * 8;
          const my = cy + Math.sin(angle) * orbitRy - unit * 0.06 + pointer.y * 5;
          const pulse = reducedMotion
            ? 0.55
            : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(elapsedSec * 1.4 + i * 1.7));

          ctx.fillStyle = isLight
            ? `rgba(26, 115, 232, ${pulse * 0.45})`
            : `rgba(138, 180, 248, ${pulse * 0.65})`;
          ctx.beginPath();
          ctx.arc(mx, my, 1.35 + (i % 2) * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const startTime = performance.now();

    const tick = (now: number) => {
      if (isVisible) {
        const elapsedSec = (now - startTime) * 0.001;
        renderFrame(elapsedSec);
      }
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      if (reducedMotion) {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        renderFrame(0);
      } else if (!rafId) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    motionQuery.addEventListener?.('change', handleMotionChange);

    renderFrame(0);
    if (!reducedMotion) {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      motionQuery.removeEventListener?.('change', handleMotionChange);
    };
  }, [variant, theme, size]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={`relative select-none ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}
