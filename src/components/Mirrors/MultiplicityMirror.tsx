import React, { useEffect, useRef } from 'react';
import { useCamera } from '../../context/CameraContext';

const vsSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_videoRes;
  uniform vec2 u_mouse;

  void main() {
    vec2 screenUv = gl_FragCoord.xy / u_resolution.xy; 
    screenUv.y = 1.0 - screenUv.y; // Standard top-to-bottom

    float mX = (u_mouse.x - 0.5) * 2.0;

    float numCols = 4.0;
    float colFloat = screenUv.x * numCols;
    float colIndex = clamp(floor(colFloat), 0.0, 3.0);
    float colFract = fract(colFloat);
    
    // Folding screen 3D parallax
    float foldDir = mod(colIndex, 2.0) == 0.0 ? 1.0 : -1.0;
    float tilt = foldDir * mX * 0.06;
    
    float yOffset = (screenUv.y - 0.5) * tilt * 0.2; 
    vec2 localUv = vec2(colFract, screenUv.y + yOffset);
    localUv.x += tilt * 0.15; // Parallax shift

    float colAspect = (u_resolution.x / numCols) / u_resolution.y;
    // protect against divide by zero
    float vidAspect = u_videoRes.x / max(u_videoRes.y, 1.0);
    
    vec2 videoUv = localUv;
    if (colAspect > vidAspect) {
        float scale = colAspect / vidAspect;
        videoUv.y = (videoUv.y - 0.5) / scale + 0.5;
    } else {
        float scale = vidAspect / colAspect;
        videoUv.x = (videoUv.x - 0.5) / scale + 0.5;
    }
    
    videoUv.x = 1.0 - videoUv.x; // mirror horizontally
    
    vec2 distortedUv = videoUv;

    // Lerped & Clamped interaction values
    float intensityX = clamp(u_mouse.x, 0.0, 1.0);
    float intensityY = clamp(u_mouse.y, 0.0, 1.0);

    // Panel 1: Vortex Emotion (Fixed center)
    if (colIndex == 0.0) {
        vec2 center = vec2(0.5, 0.5);
        vec2 diff = distortedUv - center;
        float dist = length(diff * vec2(vidAspect, 1.0));
        
        // Fluid strength smoothly modulated by y
        float strength = 2.0 + intensityY * 2.5; 
        float angle = smoothstep(0.7, 0.0, dist) * strength * sin(u_time * 2.0);
        
        float s = sin(angle);
        float c = cos(angle);
        distortedUv = center + vec2(diff.x * c - diff.y * s, diff.x * s + diff.y * c);
    } 
    // Panel 2: Flawless Skin + Huge Eye Bulge (Fixed center)
    else if (colIndex == 1.0) {
        vec2 center = vec2(0.5, 0.45); // fixed upper-mid center for eyes
        vec2 diff = distortedUv - center;
        float dist = length(diff * vec2(vidAspect, 1.0));
        float radius = 0.35; // Dramatic massive lens
        
        if (dist < radius) {
            float percent = dist / radius;
            float bulge = percent * percent * (3.0 - 2.0 * percent);
            // Limit bulge magnitude to avoid tearing
            float magnitude = 0.4 + intensityX * 0.6;
            distortedUv = center + diff * bulge * magnitude;
        }
    }
    // Panel 4: Identity Void (Pixelate)
    else if (colIndex == 3.0) {
        // Clamped grid pixelation, smaller/more blocks
        float pixels = 25.0 + 50.0 * (1.0 - intensityY); 
        pixels = clamp(pixels, 20.0, 100.0);
        vec2 pixelSize = vec2(1.0 / (pixels * vidAspect), 1.0 / pixels);
        distortedUv = floor(distortedUv / pixelSize) * pixelSize + pixelSize * 0.5;
    }

    // Strict UV clamp for safety
    distortedUv.x = clamp(distortedUv.x, 0.001, 0.999);
    distortedUv.y = clamp(distortedUv.y, 0.001, 0.999);

    vec4 color = texture2D(u_image, distortedUv);

    // Panel 2 Skin Smoothing Simulation (Brighten considerably for a plastic look)
    if (colIndex == 1.0) {
        color.rgb = min(color.rgb + vec3(0.12), 1.0); 
    }

    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    // Tone mapping
    if (colIndex == 0.0) {
        gray = clamp((gray - 0.5) * 1.8 + 0.5, 0.0, 1.0); // Extreme contrast
    } else if (colIndex == 2.0) {
        gray = clamp((gray - 0.5) * 1.3 + 0.5, 0.0, 1.0); // Clean contrast
    } else if (colIndex == 3.0) {
        gray = clamp((gray - 0.5) * 2.0 + 0.5, 0.0, 1.0); // Harsh contrast pixelate
    } else {
        gray = clamp((gray - 0.5) * 1.4 + 0.5, 0.0, 1.0);
    }
    
    vec4 finalColor = vec4(vec3(gray), 1.0);

    // Crystal edge rendering
    float edgeDist = min(colFract, 1.0 - colFract);
    float edgePixels = edgeDist * (u_resolution.x / numCols);

    float shadow = smoothstep(0.0, 30.0, edgePixels);
    finalColor.rgb *= mix(0.6, 1.0, shadow); // Weakened inner shadow

    if (colIndex > 0.0 && colIndex < numCols) {
        if (edgePixels < 1.0) {
            finalColor.rgb += vec3(0.25); // sharp crystal glint
        } else if (edgePixels < 2.0) {
            finalColor.rgb *= 0.6; // dark refractive line
        }
    }

    gl_FragColor = finalColor;
  }
`;

export default function MultiplicityMirror() {
  const { videoElement } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Track continuous target with easing
  const mouseRef = useRef({ target: { x: 0.5, y: 0.5 }, current: { x: 0.5, y: 0.5 } });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current.target.x = Math.max(0.0, Math.min(1.0, e.clientX / window.innerWidth));
      mouseRef.current.target.y = Math.max(0.0, Math.min(1.0, e.clientY / window.innerHeight));
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useEffect(() => {
    if (!videoElement || !canvasRef.current) return;

    const gl = canvasRef.current.getContext('webgl');
    if (!gl) return;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const createTexture = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return tex;
    };

    const texMain = createTexture();

    const uTime = gl.getUniformLocation(program, "u_time");
    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uVideoRes = gl.getUniformLocation(program, "u_videoRes");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uImage = gl.getUniformLocation(program, "u_image");

    // Motion detection canvas
    const motionCanvas = document.createElement('canvas');
    motionCanvas.width = 64;
    motionCanvas.height = 64;
    const mCtx = motionCanvas.getContext('2d', { willReadFrequently: true })!;
    let lastData: Uint8ClampedArray | null = null;

    let rafId: number;
    let time = 0;
    let cw = 0;
    let ch = 0;

    const loop = () => {
      // Sync canvas dimensions to viewport
      if (canvasRef.current && (canvasRef.current.width !== window.innerWidth || canvasRef.current.height !== window.innerHeight)) {
        cw = window.innerWidth;
        ch = window.innerHeight;
        canvasRef.current.width = cw;
        canvasRef.current.height = ch;
        gl.viewport(0, 0, cw, ch);
        gl.uniform2f(uResolution, cw, ch);
      }

      if (videoElement.videoWidth && videoElement.videoHeight) {
        gl.uniform2f(uVideoRes, videoElement.videoWidth, videoElement.videoHeight);
      }

      // Fast optical flow / hand tracking via miniature canvas
      mCtx.save();
      mCtx.translate(64, 0);
      mCtx.scale(-1, 1);
      mCtx.drawImage(videoElement, 0, 0, 64, 64);
      mCtx.restore();

      const imgData = mCtx.getImageData(0, 0, 64, 64);
      const data = imgData.data;
      let cmX = 0, cmY = 0, mass = 0;

      if (lastData) {
        for (let i = 0; i < data.length; i += 4) {
          const diff = Math.abs(data[i]-lastData[i]) + Math.abs(data[i+1]-lastData[i+1]) + Math.abs(data[i+2]-lastData[i+2]);
          if (diff > 40) {
            const idx = i / 4;
            cmX += idx % 64;
            cmY += Math.floor(idx / 64);
            mass++;
          }
        }
      }
      lastData = new Uint8ClampedArray(data);

      // Mouse interaction dominates, but if significant motion, guide towards it slightly
      if (mass > 40) {
        let targetX = cmX / 64;
        let targetY = cmY / 64;
        targetX = Math.max(0.0, Math.min(1.0, targetX));
        targetY = Math.max(0.0, Math.min(1.0, targetY));
        mouseRef.current.target.x = mouseRef.current.target.x * 0.95 + targetX * 0.05;
        mouseRef.current.target.y = mouseRef.current.target.y * 0.95 + targetY * 0.05;
      }

      time += 0.016;

      // Smooth interpolation for silky liquid movement
      const m = mouseRef.current;
      m.current.x += (m.target.x - m.current.x) * 0.08;
      m.current.y += (m.target.y - m.current.y) * 0.08;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texMain);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);

      gl.uniform1i(uImage, 0);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, m.current.x, m.current.y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafId = requestAnimationFrame(loop);
    };
    
    // Short delay to allow video to settle
    const delayId = setTimeout(() => { loop(); }, 100);

    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(rafId);
    };
  }, [videoElement]);

  return (
    <>
       <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </>
  );
}


