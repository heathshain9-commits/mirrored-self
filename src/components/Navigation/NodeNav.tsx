import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioMode } from '../../lib/AudioEngine';

interface NodeNavProps {
  currentMode: AudioMode;
  onChangeMode: (mode: AudioMode) => void;
}

export default function NodeNav({ currentMode, onChangeMode }: NodeNavProps) {
  const [isExpanded, setIsExpanded] = useState(false);

    const modes: { id: AudioMode; label: string; subLabel: string }[] = [
      { id: 'distorted', label: '幻 觉', subLabel: 'ILLUSION' },
      { id: 'delayed', label: '滞 后', subLabel: 'LAG' },
      { id: 'shattered', label: '断 裂', subLabel: 'FRACTURE' },
      { id: 'multiplicity', label: '接 受', subLabel: 'ACCEPTANCE' },
    ];

  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center">
      <motion.div
        layout
        className="flex items-center gap-1 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl"
        initial={{ borderRadius: 100 }}
        animate={{
          padding: isExpanded ? '8px 24px' : '16px',
          borderRadius: 100
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        onClick={() => setIsExpanded(true)}
      >
        <AnimatePresence mode="popLayout">
          {!isExpanded && (
            <motion.div
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="w-2 h-2 rounded-full bg-white/80 shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.8)]"
            />
          )}

          {isExpanded && modes.map((mode) => (
            <motion.button
              layout
              key={mode.id}
              onClick={(e) => {
                e.stopPropagation();
                onChangeMode(mode.id);
                setIsExpanded(false);
              }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className={`flex flex-col items-center px-6 py-2 transition-colors duration-500 ${
                currentMode === mode.id ? 'text-white' : 'text-white/30 hover:text-white/70'
              }`}
            >
              <span className="text-[11px] tracking-[0.4em] mb-0.5">{mode.label}</span>
              <span className="text-[8px] font-serif tracking-[0.2em] opacity-60">
                {mode.subLabel}
              </span>
              
              {currentMode === mode.id && (
                <motion.div 
                  layoutId="activeIndicator"
                  className="w-1 h-1 bg-white rounded-full mt-2 absolute bottom-2" 
                />
              )}
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
