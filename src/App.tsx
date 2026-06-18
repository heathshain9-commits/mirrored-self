import React, { useEffect, useState, useRef } from 'react';
import { CameraProvider, useCamera } from './context/CameraContext';
import { engine, AudioMode } from './lib/AudioEngine';
import DistortedMirror from './components/Mirrors/DistortedMirror';
import DelayedMirror from './components/Mirrors/DelayedMirror';
import ShatteredMirror from './components/Mirrors/ShatteredMirror';
import MultiplicityMirror from './components/Mirrors/MultiplicityMirror';
import NodeNav from './components/Navigation/NodeNav';
import { AnimatePresence, motion } from 'motion/react';

const SCENE_CONFIG = {
  distorted: {
    topRight: "第一幕 — 幻觉",
    center: "主观的幻象，重塑了真实的重量。",
    bottom: "[ 保持凝视，观察情绪的形变 ]"
  },
  delayed: {
    topRight: "第二幕 — 滞后",
    center: "意识，总在时间的回响中迟到。",
    bottom: "[ 晃动身体，感受认知的时差 ]"
  },
  shattered: {
    topRight: "第三幕 — 断裂",
    center: "打破单一的妄念，真理藏在碎片里。",
    bottom: "[ 用力划破屏幕，直面真实 ]"
  },
  multiplicity: {
    topRight: "FINAL ACT — 接受",
    center: "每一次解离，都是一次确立。",
    bottom: "[ 拥抱所有的侧面 ]"
  }
};

type AppStage = 'setup' | 'prologue' | 'act';

function AppContent() {
  const { isReady, requestCamera, permissionGranted, videoElement } = useCamera();
  
  const [appStage, setAppStage] = useState<AppStage>('setup');
  const [currentMode, setCurrentMode] = useState<AudioMode>('distorted');
  const [mirrorVisible, setMirrorVisible] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleStart = async () => {
    await engine.init();
    await requestCamera();
    setAppStage('prologue');
  };

  // Prologue Sequence
  useEffect(() => {
    if (appStage === 'prologue') {
      const timer = setTimeout(() => {
        setAppStage('act');
      }, 3500); // Wait 3.5 seconds before transitioning to Act 1
      return () => clearTimeout(timer);
    } else if (appStage === 'act' && !isTransitioning) {
      // Upon entering act 1, wait 0.8s then fade in mirror
      engine.setMode('distorted');
      const timer = setTimeout(() => {
        setMirrorVisible(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [appStage]);

  // Audio engine mouse modulation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      engine.modulateWithMouse(nx, ny);
    };
    if (appStage === 'act') {
      window.addEventListener('mousemove', handleMouseMove);
    }
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [appStage]);

  // Gesture Swipe to change modes
  useEffect(() => {
    if (appStage !== 'act' || !videoElement || isTransitioning) return;
    
    const w = 64;
    const h = 64;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let lastData: Uint8ClampedArray | null = null;
    let swipeAccumulator = 0;
    let lastCmX = -1;
    let animationFrameId: number;

    const Modes: AudioMode[] = ['distorted', 'delayed', 'shattered', 'multiplicity'];

    const checkMotion = () => {
      ctx.drawImage(videoElement, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      let sumX = 0;
      let motionPixels = 0;

      if (lastData) {
        for (let y = 0; y < h; y+=2) {
          for (let x = 0; x < w; x+=2) {
            const idx = (y * w + x) * 4;
            const diff = Math.abs(data[idx] - lastData[idx]) + Math.abs(data[idx+1] - lastData[idx+1]) + Math.abs(data[idx+2] - lastData[idx+2]);
            if (diff > 50) {
              motionPixels++;
              sumX += x;
            }
          }
        }
      }

      lastData = new Uint8ClampedArray(data);

      if (motionPixels > 50) {
        const cmX = sumX / motionPixels;
        if (lastCmX !== -1) {
          const dx = cmX - lastCmX;
          if ((dx > 0 && swipeAccumulator >= 0) || (dx < 0 && swipeAccumulator <= 0)) {
            swipeAccumulator += dx;
          } else {
            swipeAccumulator = dx;
          }
        }
        lastCmX = cmX;
      } else {
        swipeAccumulator *= 0.8; 
        lastCmX = -1;
      }

      if (Math.abs(swipeAccumulator) > 55) {
        const dir = swipeAccumulator > 0 ? -1 : 1; 
        swipeAccumulator = 0;
        
        const idx = Modes.indexOf(currentMode);
        let nextIdx = (idx + dir) % Modes.length;
        if (nextIdx < 0) nextIdx += Modes.length;
        const nextMode = Modes[nextIdx];
        
        handleModeChange(nextMode);
      } else {
        animationFrameId = requestAnimationFrame(checkMotion);
      }
    };
    
    checkMotion();
    return () => cancelAnimationFrame(animationFrameId);
  }, [appStage, videoElement, isTransitioning, currentMode]);

  const handleModeChange = (newMode: AudioMode) => {
    if (newMode === currentMode || isTransitioning) return;
    setIsTransitioning(true);
    setMirrorVisible(false); // Fade out current mirror
    
    setTimeout(() => {
      setCurrentMode(newMode);
      engine.setMode(newMode);
      
      // Wait 0.8s reading time before showing new mirror
      setTimeout(() => {
        setMirrorVisible(true);
        setIsTransitioning(false);
      }, 800);
      
    }, 1200); // Give 1.2s for mirror to fade to black
  };

  return (
    <div className="w-screen h-screen relative bg-black text-[#D4D4D4] overflow-hidden flex flex-col items-center justify-between cursor-crosshair">
      
      {/* Setup Screen */}
      <AnimatePresence>
        {appStage === 'setup' && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black"
          >
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1A1A2E] rounded-full blur-[120px] opacity-40"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#2E1A1A] rounded-full blur-[150px] opacity-30"></div>
            
            <motion.div 
               initial={{ opacity: 0, tracking: '0em' }}
               animate={{ opacity: 1, tracking: '0.2em' }}
               transition={{ duration: 3, ease: 'easeOut' }}
               className="text-center font-serif text-white/90 z-10"
            >
               <h1 className="text-2xl font-light mb-6 uppercase tracking-[0.2em]">镜 中 的 自 我 认 知</h1>
               <p className="text-[10px] uppercase font-sans text-white/40 mb-12 tracking-[0.4em]">
                 Mirrored Self-Awareness
               </p>
            </motion.div>

            <motion.div 
              onClick={handleStart}
              animate={{ opacity: [0.3, 1, 0.3] }} 
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="z-10 text-[9px] uppercase font-bold tracking-[0.2em] text-white/50 border border-white/20 px-8 py-4 rounded-full transition-colors bg-white/5 backdrop-blur-2xl shadow-2xl cursor-pointer hover:bg-white/10"
            >
              {permissionGranted === false ? '请 允 许 摄 像 头 权 限' : '点 击 唤 醒 深 渊'}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prologue Screen */}
      <AnimatePresence>
        {appStage === 'prologue' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1.5 } }}
            className="absolute inset-0 flex items-center justify-center z-50 bg-black pointer-events-none"
          >
            <div className="text-center space-y-6">
              <p className="text-2xl md:text-3xl font-serif text-white/90 tracking-widest drop-shadow-xl">
                你所看到的自己，
              </p>
              <p className="text-2xl md:text-3xl font-serif text-white/90 tracking-widest drop-shadow-xl">
                是肉体的反射，还是社会的投射？
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Act Layer */}
      {appStage === 'act' && (
        <>
          {/* Mirrored Canvas Container */}
          <div className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out z-0 ${mirrorVisible ? 'opacity-100' : 'opacity-0'}`}>
             {isReady && currentMode === 'distorted' && <DistortedMirror />}
             {isReady && currentMode === 'delayed' && <DelayedMirror />}
             {isReady && currentMode === 'shattered' && <ShatteredMirror />}
             {isReady && currentMode === 'multiplicity' && <MultiplicityMirror />}
          </div>

          {/* Act UI Overlay */}
          <div className="absolute inset-0 z-10 p-10 flex flex-col justify-between pointer-events-none">
            
            <header className="flex justify-between items-start w-full opacity-70">
              <div className="font-sans text-[10px] tracking-[0.4em] uppercase text-white/60">
                  心理空间
              </div>
              <div className="font-sans text-[10px] tracking-[0.4em] uppercase text-white/60 text-right">
                  {SCENE_CONFIG[currentMode].topRight}
              </div>
            </header>

            {/* Central Narrative Text */}
            <div className={`flex-1 flex justify-center w-full ${currentMode === 'multiplicity' ? 'items-start pt-[12vh]' : 'items-center'}`}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentMode}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="text-3xl md:text-4xl font-serif italic text-white/90 leading-relaxed max-w-xl text-center drop-shadow-2xl"
                >
                  "{SCENE_CONFIG[currentMode].center}"
                </motion.p>
              </AnimatePresence>
            </div>

            <footer className="w-full flex flex-col items-center gap-12 pb-4">
              {/* Navigation Node map */}
              <div className="pointer-events-auto">
                <NodeNav currentMode={currentMode} onChangeMode={handleModeChange} />
              </div>

              {/* Bottom Hint Text */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentMode}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  exit={{ opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/60"
                >
                  {SCENE_CONFIG[currentMode].bottom}
                </motion.div>
              </AnimatePresence>
            </footer>

          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <CameraProvider>
      <AppContent />
    </CameraProvider>
  );
}


