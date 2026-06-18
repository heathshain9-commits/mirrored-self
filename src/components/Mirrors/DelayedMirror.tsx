import React, { useEffect, useRef, useMemo } from 'react';
import { useCamera } from '../../context/CameraContext';

const MAX_FRAMES = 240; // up to 4 seconds at 60fps
const MOTION_SENSITIVITY = 25; // threshold for pixel diff

export default function DelayedMirror() {
  const { videoElement } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // We need multiple canvases:
  // 1. Array of offscreen canvases for the frame buffer
  // 2. A tiny canvas for motion detection (downsampled for performance)
  
  const bufferCanvases = useMemo(() => {
    return Array.from({ length: MAX_FRAMES }).map(() => {
      const c = document.createElement('canvas');
      // We will size these on resize, but to save memory we can fix their size
      // or size them to the window size. Sizing them to window size might be heavy
      // for 120 frames at 4k... Let's use a fixed internal resolution for effects.
      return c;
    });
  }, []);

  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const motionCanvas = document.createElement('canvas');
    motionCanvas.width = 64;
    motionCanvas.height = 64;
    const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true })!;

    // internal resolution for the buffer to save memory
    const renderW = 1280;
    const renderH = 720;

    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      
      bufferCanvases.forEach(c => {
        c.width = renderW;
        c.height = renderH;
      });
    };
    window.addEventListener('resize', resize);
    resize();

    let index = 0;
    let animationFrameId: number;
    let frameCount = 0;

    // State for interactions
    let motionIntensity = 0;
    let stillnessCounter = 0;
    let ghostLayers = 5;
    let delayAmount = 30; // frames
    let glitchActive = false;
    let glitchTimer = 0;
    let radialFlowerActive = false;
    let radialFlowerPhase = 0;
    let ghostExpansion = 50;
    let bloomIntensity = 0.3;

    let lastMotionData: Uint8ClampedArray | null = null;

    const render = () => {
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;
      if (!vw || !vh) return;

      // 1. Write current frame to buffer
      const curBuff = bufferCanvases[index];
      const curCtx = curBuff.getContext('2d', { alpha: false })!;
      
      const srcRatio = vw / vh;
      const dstRatio = renderW / renderH;
      let sx, sy, sw, sh;
      if (srcRatio > dstRatio) {
        sh = vh; sw = vh * dstRatio; sx = (vw - sw) / 2; sy = 0;
      } else {
        sw = vw; sh = vw / dstRatio; sx = 0; sy = (vh - sh) / 2;
      }

      curCtx.save();
      curCtx.translate(renderW, 0);
      curCtx.scale(-1, 1);
      curCtx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, renderW, renderH);
      curCtx.restore();

      // 2. Motion Detection (Downsampled)
      motionCtx.drawImage(curBuff, 0, 0, 64, 64);
      const motionImgData = motionCtx.getImageData(0, 0, 64, 64);
      const data = motionImgData.data;
      
      let motionPixels = 0;
      let skinPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];

        // Basic YCbCr Skin detection
        const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
        if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
          skinPixels++;
        }

        // Motion detection
        if (lastMotionData) {
          const lr = lastMotionData[i];
          const lg = lastMotionData[i+1];
          const lb = lastMotionData[i+2];
          const diff = Math.abs(r - lr) + Math.abs(g - lg) + Math.abs(b - lb);
          if (diff > MOTION_SENSITIVITY * 3) {
            motionPixels++;
          }
        }
      }

      lastMotionData = new Uint8ClampedArray(data);
      
      const totalPixels = 64 * 64;
      const motionRatio = motionPixels / totalPixels;
      const skinRatio = skinPixels / totalPixels;

      // Smooth motion intensity
      const rawIntensity = motionRatio * 10;
      motionIntensity = motionIntensity * 0.8 + rawIntensity * 0.2;

      // 3. Process Interactions
      // Slow wave -> increase ghost layers
      if (motionIntensity > 0.3 && motionIntensity < 1.5) {
        if (frameCount % 10 === 0 && ghostLayers < 15) {
          ghostLayers += 0.5;
        }
      } else {
        ghostLayers = Math.max(3, ghostLayers - 0.1);
      }

      // Fast wave -> Glitch
      if (motionIntensity > 3 && !glitchActive) {
        glitchActive = true;
        glitchTimer = 30;
      }
      if (glitchActive) {
        glitchTimer--;
        if (glitchTimer <= 0) glitchActive = false;
      }

      // Buffer distance adjustment
      const targetDelay = Math.floor(45 + skinRatio * 160); // 45 to 205 frames
      delayAmount = delayAmount * 0.95 + targetDelay * 0.05;

      // Stillness -> Flower
      if (motionIntensity < 0.1) {
        stillnessCounter++;
        if (stillnessCounter > 150) radialFlowerActive = true;
      } else {
        stillnessCounter = Math.max(0, stillnessCounter - 5);
        if (stillnessCounter < 75) radialFlowerActive = false;
      }

      if (radialFlowerActive) radialFlowerPhase += 0.02;

      // Block block/close-up -> Bloom intensity
      if (skinRatio > 0.2) {
        bloomIntensity = Math.min(0.8, bloomIntensity + 0.02);
      } else {
        bloomIntensity = Math.max(0.3, bloomIntensity - 0.02);
      }

      // 4. Render Main Output
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const rSrcRatio = renderW / renderH;
      const rDstRatio = w / h;
      let rx, ry, rw, rh;
      if (rSrcRatio > rDstRatio) {
        rh = renderH; rw = renderH * rDstRatio; rx = (renderW - rw) / 2; ry = 0;
      } else {
        rw = renderW; rh = renderW / rDstRatio; rx = 0; ry = (renderH - rh) / 2;
      }

      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `grayscale(90%) sepia(10%) hue-rotate(200deg) brightness(80%) contrast(90%)`;

      const numGhosts = Math.floor(ghostLayers);
      
      // Draw oldest layers to newest layer
      for (let i = numGhosts; i >= 0; i--) {
        const frameDelay = Math.floor(delayAmount) + i * 15; 
        const frameIdx = (index - frameDelay + MAX_FRAMES) % MAX_FRAMES;
        const layerFrame = bufferCanvases[frameIdx];
        if (!layerFrame) continue;

        let alpha;
        if (i === 0) {
          alpha = 0.85; // most prominent
        } else {
          // smoothly fade out older layers
          alpha = Math.max(0.05, 0.6 - (i / numGhosts) * 0.5); 
        }

        const offsetX = (i === 0) ? 0 : Math.sin(frameCount * 0.05 + i) * ghostExpansion * (i / numGhosts);
        const offsetY = (i === 0) ? 0 : Math.cos(frameCount * 0.03 + i) * 10 * (i / numGhosts);

        ctx.globalAlpha = alpha;
        
        // Apply glitch shift if active and it's the main frame
        if (i === 0 && glitchActive) {
          const shiftX = (Math.random() - 0.5) * 40;
          const shiftY = (Math.random() - 0.5) * 20;
          
          ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          ctx.drawImage(layerFrame, rx, ry, rw, rh, shiftX + offsetX, shiftY + offsetY, w, h);
          
          ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
          ctx.drawImage(layerFrame, rx, ry, rw, rh, -shiftX + offsetX, -shiftY + offsetY, w, h);
        } else {
          ctx.drawImage(layerFrame, rx, ry, rw, rh, offsetX, offsetY, w, h);
        }
      }
      
      ctx.filter = 'none';
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';

      // 6. Post-Processing overlays
      ctx.globalCompositeOperation = 'source-over';

      // Scanlines (1px spacing as requested)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; 
      for (let y = 0; y < h; y += 2) { // 1px space between lines
        ctx.fillRect(0, y, w, 1);
      }

      // Quick dynamic Film Grain
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.15;
      const noiseOffset = Math.random() * 100;
      // We can use a simple trick of just filling with a randomly offset pattern if we had one
      // Since creating one per frame is too expensive, we'll draw semi-randomly colored boxes
      for (let i = 0; i < 400; i++) {
         const nx = Math.random() * w;
         const ny = Math.random() * h;
         const s = 1 + Math.random() * 3;
         ctx.fillStyle = Math.random() > 0.5 ? '#FFF' : '#000';
         ctx.fillRect(nx, ny, s, s);
      }
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';

      // Simple Bloom pass using blur
      if (bloomIntensity > 0.1) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = bloomIntensity;
        ctx.filter = 'blur(16px)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }

      // Radial Flower
      if (radialFlowerActive) {
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.min(w, h) * 0.4;
        ctx.globalCompositeOperation = 'screen';
        
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + radialFlowerPhase;
          const r = maxR * (0.5 + 0.5 * Math.sin(radialFlowerPhase * 2 + i));
          const fx = cx + Math.cos(angle) * r;
          const fy = cy + Math.sin(angle) * r;
          
          const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 0.5);
          grad.addColorStop(0, `rgba(100, 150, 200, ${0.1 * Math.sin(radialFlowerPhase)})`);
          grad.addColorStop(1, 'rgba(100, 150, 200, 0)');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(fx, fy, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      index = (index + 1) % MAX_FRAMES;
      frameCount++;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoElement, bufferCanvases]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover mix-blend-screen" />;
}
