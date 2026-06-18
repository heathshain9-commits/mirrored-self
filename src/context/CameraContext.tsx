import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

interface CameraContextType {
  videoElement: HTMLVideoElement | null;
  isReady: boolean;
  permissionGranted: boolean | null;
  requestCamera: () => Promise<void>;
}

const CameraContext = createContext<CameraContextType | null>(null);

export const CameraProvider = ({ children }: { children: ReactNode }) => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      
      const video = document.createElement('video');
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      video.srcObject = stream;
      
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      setVideoElement(video);
      setIsReady(true);
      setPermissionGranted(true);
    } catch (err) {
      console.error("Camera error:", err);
      setPermissionGranted(false);
    }
  };

  return (
    <CameraContext.Provider value={{ videoElement, isReady, permissionGranted, requestCamera }}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = () => {
  const context = useContext(CameraContext);
  if (!context) throw new Error("useCamera must be used within CameraProvider");
  return context;
};
