
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

interface HandControllerProps {
  onGestureChaos: () => void;
  onGestureForm: () => void;
  onDrag: (dx: number) => void;
  onZoom: (dy: number) => void;
  onDoublePinch: () => void;
  onPinch: () => void;
}

const HandController: React.FC<HandControllerProps> = ({ 
  onGestureChaos, 
  onGestureForm, 
  onDrag, 
  onZoom, 
  onDoublePinch,
  onPinch
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const lastXRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);
  const isPinchingRef = useRef<boolean>(false);
  const lastPinchTimeRef = useRef<number>(0);
  
  const STABILITY_THRESHOLD = 6; 
  const dualOpenFramesRef = useRef<number>(0);
  const fistStateFramesRef = useRef<number>(0);

  const [isActive, setIsActive] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<'none' | 'chaos' | 'form' | 'pinch' | 'pointing'>('none');

  useEffect(() => {
    let isMounted = true;
    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2 
        });
        if (isMounted) setupCamera();
      } catch (err) {
        console.error("Landmarker Init Error:", err);
      }
    };

    const setupCamera = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480, facingMode: "user" } 
        });
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            if (isMounted) {
              setIsActive(true);
              requestAnimationFrame(predict);
            }
          });
        };
      } catch (err) {
        console.error("Camera Error:", err);
      }
    };

    const predict = () => {
      if (!isMounted || !videoRef.current || !landmarkerRef.current || !canvasRef.current) {
        if (isMounted) requestAnimationFrame(predict);
        return;
      }
      if (videoRef.current.readyState >= 2) {
        const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          if (results.landmarks) {
            processGestures(results);
            drawWireframe(ctx, results.landmarks);
          }
        }
      }
      requestAnimationFrame(predict);
    };

    initLandmarker();
    return () => { isMounted = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const processGestures = (results: any) => {
    const hands = results.landmarks;
    
    const isFist = (h: any[]) => {
      const tips = [8, 12, 16, 20];
      const wrist = h[0];
      return tips.every(tip => Math.sqrt(Math.pow(h[tip].x - wrist.x, 2) + Math.pow(h[tip].y - wrist.y, 2)) < 0.14);
    };

    const isOpen = (h: any[]) => {
      const tips = [8, 12, 16, 20];
      const wrist = h[0];
      return tips.every(tip => Math.sqrt(Math.pow(h[tip].x - wrist.x, 2) + Math.pow(h[tip].y - wrist.y, 2)) > 0.18);
    };

    const isPointing = (h: any[]) => {
      const wrist = h[0];
      const indexTip = h[8];
      const others = [12, 16, 20];
      const indexDist = Math.sqrt(Math.pow(indexTip.x - wrist.x, 2) + Math.pow(indexTip.y - wrist.y, 2));
      const othersCurled = others.every(tip => Math.sqrt(Math.pow(h[tip].x - wrist.x, 2) + Math.pow(h[tip].y - wrist.y, 2)) < 0.16);
      return indexDist > 0.22 && othersCurled;
    };

    const getPinchDist = (h: any[]) => {
      return Math.sqrt(Math.pow(h[4].x - h[8].x, 2) + Math.pow(h[4].y - h[8].y, 2));
    };

    if (!hands || hands.length === 0) {
      setGestureStatus('none');
      isPinchingRef.current = false;
      lastXRef.current = null;
      lastYRef.current = null;
      dualOpenFramesRef.current = 0;
      fistStateFramesRef.current = 0;
      return;
    }

    // 1. Dual Hand Logic: CHAOS (Priority)
    if (hands.length === 2) {
      if (isOpen(hands[0]) && isOpen(hands[1])) {
        dualOpenFramesRef.current++;
        setGestureStatus('chaos');
        if (dualOpenFramesRef.current > STABILITY_THRESHOLD) {
          onGestureChaos();
          dualOpenFramesRef.current = 0;
        }
      } else {
        dualOpenFramesRef.current = 0;
        setGestureStatus('none');
      }
      lastXRef.current = null;
      isPinchingRef.current = false;
      return;
    }

    // 2. Single Hand Logic
    const hand = hands[0];
    const pinchingNow = getPinchDist(hand) < 0.1; // More forgiving pinch distance
    const pointingNow = !pinchingNow && isPointing(hand);
    const fistNow = isFist(hand);

    const wrist = hand[0];
    const currentX = wrist.x;
    const currentY = wrist.y;

    if (lastXRef.current !== null && lastYRef.current !== null) {
      const dx = currentX - lastXRef.current;
      const dy = currentY - lastYRef.current;

      if (pinchingNow) {
        setGestureStatus('pinch');
      } else if (pointingNow) {
        onDrag(-dx);
        setGestureStatus('pointing');
      } else if (isOpen(hand)) {
        if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          onZoom(dy * 1.5);
        }
        setGestureStatus('none');
      }
    }

    // Pinch Start Event
    if (pinchingNow && !isPinchingRef.current) {
      const now = Date.now();
      if (now - lastPinchTimeRef.current < 450) {
        onDoublePinch();
        lastPinchTimeRef.current = 0;
      } else {
        onPinch(); 
        lastPinchTimeRef.current = now;
      }
    }

    if (fistNow) {
      fistStateFramesRef.current++;
      setGestureStatus('form');
      if (fistStateFramesRef.current > STABILITY_THRESHOLD) {
        onGestureForm();
        fistStateFramesRef.current = 0;
      }
    } else {
      fistStateFramesRef.current = 0;
    }

    lastXRef.current = currentX;
    lastYRef.current = currentY;
    isPinchingRef.current = pinchingNow;
  };

  const drawWireframe = (ctx: CanvasRenderingContext2D, landmarks: any[][]) => {
    let strokeColor = '#FFD700';
    if (gestureStatus === 'pinch') strokeColor = '#fef08a';
    if (gestureStatus === 'pointing') strokeColor = '#60a5fa';
    if (gestureStatus === 'chaos') strokeColor = '#10b981';
    if (gestureStatus === 'form') strokeColor = '#fbbf24';
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = strokeColor;

    landmarks.forEach(hand => {
      const connections = [[0,1,2,3,4], [0,5,6,7,8], [5,9,13,17], [0,17,18,19,20], [9,10,11,12], [13,14,15,16]];
      connections.forEach(path => {
        ctx.beginPath();
        ctx.moveTo(hand[path[0]].x * ctx.canvas.width, hand[path[0]].y * ctx.canvas.height);
        for(let i=1; i<path.length; i++) ctx.lineTo(hand[path[i]].x * ctx.canvas.width, hand[path[i]].y * ctx.canvas.height);
        ctx.stroke();
      });
    });
  };

  return (
    <div className={`hand-tracker-container fixed bottom-[55px] left-8 w-48 h-36 bg-emerald-950/40 backdrop-blur-md rounded-lg overflow-hidden border transition-all duration-300 z-20 pointer-events-none ${gestureStatus !== 'none' ? 'border-yellow-400 scale-105 shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'border-yellow-500/30'}`}>
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full opacity-0" />
      <canvas ref={canvasRef} width={192} height={144} className="w-full h-full opacity-60" />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <h2 className="text-[10px] font-cinzel metallic-text tracking-widest uppercase mb-1 px-2">
          {gestureStatus === 'chaos' ? 'Release Magic' : 
           gestureStatus === 'pointing' ? 'Rotate Tree' : 
           gestureStatus === 'pinch' ? 'Pinching Focus' : 
           gestureStatus === 'form' ? 'Forming Tree' :
           'Tracking Hands'}
        </h2>
      </div>
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-cinzel text-yellow-500/50 uppercase tracking-widest bg-emerald-950/80">
          Syncing...
        </div>
      )}
    </div>
  );
};

export default HandController;
