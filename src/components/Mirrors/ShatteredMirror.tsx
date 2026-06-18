import React, { useEffect, useRef } from 'react';
import { useCamera } from '../../context/CameraContext';

interface Triangle {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  cx: number;
  cy: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  targetOffsetX: number;
  targetOffsetY: number;
  targetAngle: number;
  originalTargetOffsetX: number;
  originalTargetOffsetY: number;
  originalTargetAngle: number;
}

export default function ShatteredMirror() {
  const { videoElement } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let triangles: Triangle[] = [];
    let animationFrameId: number;
    let time = 0;
    
    let mousePos = { x: -1000, y: -1000 };
    let targetMousePos = { x: -1000, y: -1000 };

    const handlePointerMove = (e: PointerEvent) => {
      targetMousePos.x = e.clientX;
      targetMousePos.y = e.clientY;
    };
    const handlePointerLeave = () => {
      targetMousePos.x = -1000;
      targetMousePos.y = -1000;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);

    const generateGrid = () => {
      triangles = [];
      const cols = 6;
      const rows = 6;
      const cellW = w / cols;
      const cellH = h / rows;

      // Create a grid of points with some noise
      const points: { x: number, y: number }[][] = [];
      for (let y = 0; y <= rows; y++) {
        const row = [];
        for (let x = 0; x <= cols; x++) {
          const noiseX = (x > 0 && x < cols) ? (Math.random() - 0.5) * cellW * 0.8 : 0;
          const noiseY = (y > 0 && y < rows) ? (Math.random() - 0.5) * cellH * 0.8 : 0;
          row.push({ x: x * cellW + noiseX, y: y * cellH + noiseY });
        }
        points.push(row);
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const pTL = points[y][x];
          const pTR = points[y][x + 1];
          const pBL = points[y + 1][x];
          const pBR = points[y + 1][x + 1];

          // Determine random split for the quad
          if (Math.random() > 0.5) {
            addTriangle(pTL, pTR, pBL);
            addTriangle(pTR, pBR, pBL);
          } else {
            addTriangle(pTL, pBR, pBL);
            addTriangle(pTL, pTR, pBR);
          }
        }
      }
    };

    const addTriangle = (p1: any, p2: any, p3: any) => {
      const cx = (p1.x + p2.x + p3.x) / 3;
      const cy = (p1.y + p2.y + p3.y) / 3;
      
      const angleRnd = (Math.random() - 0.5) * 0.3;
      const offsetXRnd = (Math.random() - 0.5) * 60;
      const offsetYrnd = (Math.random() - 0.5) * 60;

      triangles.push({
        p1, p2, p3,
        cx, cy,
        offsetX: offsetXRnd, offsetY: offsetYrnd, angle: angleRnd,
        targetOffsetX: offsetXRnd, targetOffsetY: offsetYrnd, targetAngle: angleRnd,
        originalTargetOffsetX: offsetXRnd, originalTargetOffsetY: offsetYrnd, originalTargetAngle: angleRnd
      });
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      generateGrid();
    };
    window.addEventListener('resize', resize);
    resize();

    // Secondary offscreen canvas to hold the unfractured current frame
    const baseCanvas = document.createElement('canvas');
    const bCtx = baseCanvas.getContext('2d', { alpha: false })!;

    // Motion detection canvas
    const motionW = 64;
    const motionH = 64;
    const motionCanvas = document.createElement('canvas');
    motionCanvas.width = motionW;
    motionCanvas.height = motionH;
    const mcCtx = motionCanvas.getContext('2d', { willReadFrequently: true })!;
    let lastData: Uint8ClampedArray | null = null;
    let HandActiveFrames = 0;

    const render = () => {
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;
      if (!vw || !vh) return;
      
      time += 0.01;

      // Detect motion for gesture interaction
      mcCtx.save();
      mcCtx.translate(motionW, 0);
      mcCtx.scale(-1, 1);
      mcCtx.drawImage(videoElement, 0, 0, motionW, motionH);
      mcCtx.restore();

      const imgData = mcCtx.getImageData(0, 0, motionW, motionH);
      const data = imgData.data;
      let maxCount = 0;
      let maxIdx = -1;
      let mass = 0;

      // 8x8 grid to find the localized area of highest motion (likely a hand)
      const grid = new Array(64).fill(0);

      if (lastData) {
        for (let y = 0; y < motionH; y+=2) {
          for (let x = 0; x < motionW; x+=2) {
            const i = (y * motionW + x) * 4;
            const diff = Math.abs(data[i]-lastData[i]) + Math.abs(data[i+1]-lastData[i+1]) + Math.abs(data[i+2]-lastData[i+2]);
            if (diff > 45) { // Threshold for motion
              const gx = Math.floor(x / 8);
              const gy = Math.floor(y / 8);
              grid[gy * 8 + gx]++;
              mass++;
            }
          }
        }
      }
      lastData = new Uint8ClampedArray(data);

      for (let i = 0; i < 64; i++) {
        if (grid[i] > maxCount) {
          maxCount = grid[i];
          maxIdx = i;
        }
      }

      if (maxIdx !== -1 && maxCount > 3) { // Localized motion threshold
        const gx = maxIdx % 8;
        const gy = Math.floor(maxIdx / 8);
        targetMousePos.x = ((gx * 8 + 4) / motionW) * w;
        targetMousePos.y = ((gy * 8 + 4) / motionH) * h;
        HandActiveFrames = 15; // Keep target active for a few frames
      } else {
        if (HandActiveFrames > 0) HandActiveFrames--;
      }

      // Smooth pointer transition
      if (HandActiveFrames > 0) {
        if (mousePos.x === -1000) {
          mousePos.x = targetMousePos.x;
          mousePos.y = targetMousePos.y;
        } else {
          mousePos.x += (targetMousePos.x - mousePos.x) * 0.3;
          mousePos.y += (targetMousePos.y - mousePos.y) * 0.3;
        }
      } else {
        mousePos.x = -1000;
      }

      // Mouse effect on triangles
      triangles.forEach((t) => {
        const dx = t.cx + t.offsetX - mousePos.x;
        const dy = t.cy + t.offsetY - mousePos.y;
        const dScale = Math.sqrt(dx * dx + dy * dy);
        
        // When mouse is near, scatter them further
        if (mousePos.x !== -1000 && dScale < 300) { 
          const interactForce = (300 - dScale) / 300;
          t.targetOffsetX += (dx / dScale) * 30 * interactForce;
          t.targetOffsetY += (dy / dScale) * 30 * interactForce;
          t.targetAngle += (Math.random() - 0.5) * 0.4 * interactForce;
        } else {
          // Quickly regress to their original target offset
          t.targetOffsetX = t.targetOffsetX * 0.90 + t.originalTargetOffsetX * 0.10;
          t.targetOffsetY = t.targetOffsetY * 0.90 + t.originalTargetOffsetY * 0.10;
          t.targetAngle = t.targetAngle * 0.90 + t.originalTargetAngle * 0.10;
        }
      });

      baseCanvas.width = w;
      baseCanvas.height = h;

      const srcRatio = vw / vh;
      const dstRatio = w / h;
      let sx, sy, sw, sh;
      if (srcRatio > dstRatio) {
        sh = vh; sw = vh * dstRatio; sx = (vw - sw) / 2; sy = 0;
      } else {
        sw = vw; sh = vw / dstRatio; sx = 0; sy = (vh - sh) / 2;
      }

      bCtx.save();
      bCtx.translate(w, 0);
      bCtx.scale(-1, 1);
      bCtx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, w, h);
      bCtx.restore();

      ctx.clearRect(0, 0, w, h);

      const breathingPhase = Math.sin(time); // -1 to 1

      triangles.forEach((t) => {
        // Slowly drift between shattered and reconstructed
        // when breathingPhase is near 1, it's mostly reconstructed
        // when it's near -1, it's mostly shattered
        const shatterRatio = (Math.sin(time + (t.cx / w) * 2) + 1) / 2; 

        // Lerp towards dynamic targets
        t.offsetX = t.targetOffsetX * (1 - shatterRatio);
        t.offsetY = t.targetOffsetY * (1 - shatterRatio);
        t.angle = t.targetAngle * (1 - shatterRatio);

        // Add a slight continuous floating drift
        const floatX = Math.sin(time * 2 + t.cy) * 5;
        const floatY = Math.cos(time * 1.5 + t.cx) * 5;

        ctx.save();
        ctx.translate(t.cx + t.offsetX + floatX, t.cy + t.offsetY + floatY);
        ctx.rotate(t.angle);
        ctx.translate(-t.cx, -t.cy);

        ctx.beginPath();
        ctx.moveTo(t.p1.x, t.p1.y);
        ctx.lineTo(t.p2.x, t.p2.y);
        ctx.lineTo(t.p3.x, t.p3.y);
        ctx.closePath();
        ctx.clip();

        // Draw the slice
        ctx.drawImage(baseCanvas, 0, 0);
        
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(200, 220, 255, ${0.1 + (1 - shatterRatio)*0.3})`;
        ctx.stroke();

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoElement]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover filter grayscale-[0.3]" />;
}
