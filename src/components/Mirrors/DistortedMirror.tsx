import React, { useEffect, useRef } from 'react';
import { useCamera } from '../../context/CameraContext';

export default function DistortedMirror() {
  const { videoElement } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const offscreenA = document.createElement('canvas');
    const ctxA = offscreenA.getContext('2d')!;
    const offscreenB = document.createElement('canvas');
    const ctxB = offscreenB.getContext('2d')!;

    // Motion detection setup for rotation
    const motionW = 64;
    const motionH = 64;
    const motionCanvas = document.createElement('canvas');
    motionCanvas.width = motionW;
    motionCanvas.height = motionH;
    const mcCtx = motionCanvas.getContext('2d', { willReadFrequently: true })!;
    let lastData: Uint8ClampedArray | null = null;
    
    let lastCmX = 0;
    let lastCmY = 0;
    let lastAngle = 0;
    let accumulatedRotation = 0;
    let displayRotationVelocity = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      offscreenA.width = window.innerWidth;
      offscreenA.height = window.innerHeight;
      offscreenB.width = window.innerWidth;
      offscreenB.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      const vw = videoElement.videoWidth;
      const vh = videoElement.videoHeight;
      if (!vw || !vh) return;

      time += 0.01;

      // Detection Loop
      mcCtx.save();
      mcCtx.translate(motionW, 0);
      mcCtx.scale(-1, 1);
      mcCtx.drawImage(videoElement, 0, 0, motionW, motionH);
      mcCtx.restore();

      const imgData = mcCtx.getImageData(0, 0, motionW, motionH);
      const data = imgData.data;
      let cmX = 0;
      let cmY = 0;
      let mass = 0;

      if (lastData) {
        for (let i = 0; i < data.length; i += 4) {
          const diff = Math.abs(data[i]-lastData[i]) + Math.abs(data[i+1]-lastData[i+1]) + Math.abs(data[i+2]-lastData[i+2]);
          if (diff > 45) {
            const idx = i / 4;
            cmX += idx % motionW;
            cmY += Math.floor(idx / motionW);
            mass++;
          }
        }
      }
      lastData = new Uint8ClampedArray(data);

      if (mass > 25) {
        cmX /= mass;
        cmY /= mass;

        const angle = Math.atan2(cmY - motionH / 2, cmX - motionW / 2);

        if (lastCmX !== 0) {
          let dAngle = angle - lastAngle;
          while (dAngle > Math.PI) dAngle -= Math.PI * 2;
          while (dAngle < -Math.PI) dAngle += Math.PI * 2;
          
          if (Math.abs(dAngle) < Math.PI / 2) {
            accumulatedRotation += dAngle * 0.15; 
          }
        }
        lastAngle = angle;
        lastCmX = cmX;
        lastCmY = cmY;
      } else {
        accumulatedRotation *= 0.95; // decay
      }

      displayRotationVelocity = displayRotationVelocity * 0.9 + accumulatedRotation * 0.1;

      // Cover scaling calculation
      const srcRatio = vw / vh;
      const dstRatio = w / h;
      let sx, sy, sw, sh;
      if (srcRatio > dstRatio) {
        sh = vh; sw = vh * dstRatio; sx = (vw - sw) / 2; sy = 0;
      } else {
        sw = vw; sh = vw / dstRatio; sx = 0; sy = (vh - sh) / 2;
      }

      // Step 1: Draw video to offscreen A
      ctxA.globalAlpha = 1.0;
      ctxA.fillStyle = `rgba(5, 5, 5, 0.08)`; // Trail effect
      ctxA.fillRect(0, 0, w, h);

      ctxA.save();
      ctxA.translate(w, 0);
      ctxA.scale(-1, 1);
      ctxA.drawImage(videoElement, sx, sy, sw, sh, 0, 0, w, h);
      ctxA.restore();

      // Step 2: Recursive deep stack
      const layers = 15;
      const rotateIntensity = Math.abs(displayRotationVelocity);
      const baseScale = Math.sin(time * 0.5) * 0.01 + Math.max(0.7, 0.96 - rotateIntensity * 0.05);
      const rotBase = Math.cos(time * 0.2) * 0.01 + displayRotationVelocity * 0.15;

      let srcC = offscreenA;
      let dstC = offscreenB;
      let dCtx = ctxB;

      for (let layer = 0; layer < layers; layer++) {
        dCtx.clearRect(0, 0, w, h);
        dCtx.globalAlpha = 1.0;
        dCtx.drawImage(srcC, 0, 0);

        dCtx.save();
        dCtx.globalAlpha = Math.pow(0.85, layer + 1);
        dCtx.translate(w / 2, h / 2);
        dCtx.rotate(rotBase * (layer + 1));
        dCtx.scale(baseScale, baseScale);
        dCtx.drawImage(srcC, -w / 2, -h / 2, w, h);
        dCtx.restore();

        // Swap ping-pong
        const tmp = srcC; srcC = dstC; dstC = tmp;
        dCtx = dstC.getContext('2d')!;
      }

      // Draw final deep mirror to view
      ctx.clearRect(0, 0, w, h);
      
      // Chromatic Aberration Simulation
      const offset = 4;
      ctx.globalCompositeOperation = 'screen';
      
      // R
      ctx.drawImage(srcC, offset, -offset);
      // G
      ctx.drawImage(srcC, 0, 0);
      // B
      ctx.drawImage(srcC, -offset, offset);

      ctx.globalCompositeOperation = 'source-over';

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [videoElement]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 pointer-events-none bg-neutral-900/30" />
    </>
  );
}
