
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

interface HandControllerProps {
  onGestureChaos: () => void;
  onGestureForm: () => void;
  onDrag: (dx: number) => void;
  onZoom: (dy: number) => void;
  onDoublePinch: () => void;
}

const HandController: React.FC<HandControllerProps> = ({ 
  onGestureChaos, 
  onGestureForm, 
  onDrag, 
  onZoom, 
  onDoublePinch 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastXRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);
  const lastPinchTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  
  // Frame counters for gesture stability
  const dualOpenFramesRef = useRef<number>(0);
  const fistStateFramesRef = useRef<number>(0);
  
  const STABILITY_THRESHOLD = 8; // Slightly faster response (8 frames instead of 10)

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gestureStatus, setGestureStatus] = useState<'none' | 'chaos' | 'form'>('none');

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
        setError("AI Model Load Failed");
      }
    };

    const setupCamera = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user" 
          } 
        });
        
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current?.play();
            if (isMounted) {
              setIsActive(true);
              requestAnimationFrame(predict);
            }
          } catch (playErr) {
            console.error("Video Play Error:", playErr);
            setError("Camera Playback Blocked");
          }
        };
      } catch (err) {
        console.error("Camera Access Error:", err);
        setError("Camera Access Denied");
      }
    };

    const predict = () => {
      if (!isMounted) return;
      if (!videoRef.current || !landmarkerRef.current || !canvasRef.current) {
        requestAnimationFrame(predict);
        return;
      }
      
      if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
        const startTimeMs = performance.now();
        const results = landmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
        
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

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const processGestures = (results: any) => {
    const hands = results.landmarks;
    
    // Improved Heuristics
    const isFist = (hand: any[]) => {
      const tips = [8, 12, 16, 20];
      const wrist = hand[0];
      // Slightly more forgiving threshold (0.14) for fist detection
      return tips.every((tip) => {
        const dist = Math.sqrt(Math.pow(hand[tip].x - wrist.x, 2) + Math.pow(hand[tip].y - wrist.y, 2));
        return dist < 0.14; 
      });
    };

    const isOpen = (hand: any[]) => {
      const tips = [8, 12, 16, 20];
      const wrist = hand[0];
      return tips.every((tip) => {
        const dist = Math.sqrt(Math.pow(hand[tip].x - wrist.x, 2) + Math.pow(hand[tip].y - wrist.y, 2));
        return dist > 0.18; // More inclusive open state
      });
    };

    if (!hands || hands.length === 0) {
      dualOpenFramesRef.current = 0;
      fistStateFramesRef.current = 0;
      setGestureStatus('none');
      lastXRef.current = null;
      lastYRef.current = null;
      return;
    }

    // --- FORMED Logic (Triggered by ANY hand forming a fist: Single or Dual) ---
    const detectedFist = hands.some((h: any[]) => isFist(h));
    
    if (detectedFist) {
      fistStateFramesRef.current++;
      dualOpenFramesRef.current = 0;
      setGestureStatus('form');
      if (fistStateFramesRef.current >= STABILITY_THRESHOLD) {
        onGestureForm();
        fistStateFramesRef.current = 0; 
      }
      // Return early to prevent other navigation logic during forming
      return; 
    } else {
      fistStateFramesRef.current = 0;
    }

    // --- CHAOS Logic (Requires exactly TWO hands detected, both OPEN) ---
    if (hands.length === 2) {
      const bothOpen = isOpen(hands[0]) && isOpen(hands[1]);
      if (bothOpen) {
        dualOpenFramesRef.current++;
        setGestureStatus('chaos');
        if (dualOpenFramesRef.current >= STABILITY_THRESHOLD) {
          onGestureChaos();
          dualOpenFramesRef.current = 0; 
        }
      } else {
        dualOpenFramesRef.current = 0;
        setGestureStatus('none');
      }
    } else {
      dualOpenFramesRef.current = 0;
    }

    // --- Navigation Logic (Exactly one hand, must be OPEN) ---
    if (hands.length === 1) {
      const hand = hands[0];
      const wrist = hand[0];

      if (isOpen(hand)) {
        if (lastXRef.current !== null && lastYRef.current !== null) {
          const dx = wrist.x - lastXRef.current;
          const dy = wrist.y - lastYRef.current;

          if (Math.abs(dy) > Math.abs(dx) * 1.1) {
            onZoom(dy * 1.5);
          } else if (Math.abs(dx) > Math.abs(dy) * 1.1) {
            onDrag(-dx * 1.2); 
          }
        }
        setGestureStatus('none');
      }

      lastXRef.current = wrist.x;
      lastYRef.current = wrist.y;

      // Double Pinch detection
      const dist = Math.sqrt(Math.pow(hand[4].x - hand[8].x, 2) + Math.pow(hand[4].y - hand[8].y, 2));
      const pinchingNow = dist < 0.035;
      if (pinchingNow && !isPinchingRef.current) {
        const now = Date.now();
        if (now - lastPinchTimeRef.current < 500) {
          onDoublePinch();
          lastPinchTimeRef.current = 0; 
        } else {
          lastPinchTimeRef.current = now;
        }
      }
      isPinchingRef.current = pinchingNow;
    } else {
      lastXRef.current = null;
      lastYRef.current = null;
    }
  };

  const drawWireframe = (ctx: CanvasRenderingContext2D, landmarks: any[][]) => {
    let strokeColor = '#FFD700';
    if (gestureStatus === 'chaos') strokeColor = '#10b981';
    if (gestureStatus === 'form') strokeColor = '#fbbf24';
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = strokeColor;

    landmarks.forEach(hand => {
      hand.forEach((point: any) => {
        ctx.beginPath();
        ctx.arc(point.x * ctx.canvas.width, point.y * ctx.canvas.height, 2, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
      });
      
      const connections = [
        [0,1,2,3,4], [0,5,6,7,8], [5,9,13,17], [0,17,18,19,20],
        [9,10,11,12], [13,14,15,16]
      ];
      connections.forEach(path => {
        ctx.beginPath();
        ctx.moveTo(hand[path[0]].x * ctx.canvas.width, hand[path[0]].y * ctx.canvas.height);
        for(let i=1; i<path.length; i++) {
          ctx.lineTo(hand[path[i]].x * ctx.canvas.width, hand[path[i]].y * ctx.canvas.height);
        }
        ctx.stroke();
      });
    });
    ctx.shadowBlur = 0;
  };

  return (
    <div className={`hand-tracker-container fixed bottom-[55px] left-8 w-48 h-36 bg-emerald-950/40 backdrop-blur-md rounded-lg overflow-hidden border transition-all duration-300 z-20 pointer-events-none ${gestureStatus !== 'none' ? 'border-yellow-400 scale-105 shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'border-yellow-500/30'}`}>
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" 
      />
      
      <canvas ref={canvasRef} width={192} height={144} className="w-full h-full opacity-60" />
      
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <h2 className="text-sm font-cinzel metallic-text tracking-widest uppercase mb-1 drop-shadow-lg">
          {gestureStatus === 'chaos' ? 'Release Magic' : gestureStatus === 'form' ? 'Rebuild Tree' : 'Merry Christmas'}
        </h2>
        <div className="h-[2px] w-12 bg-yellow-500/40 rounded-full overflow-hidden">
          <div 
            className="h-full bg-yellow-400 transition-all duration-100" 
            style={{ 
              width: `${Math.max(dualOpenFramesRef.current, fistStateFramesRef.current) * (100 / STABILITY_THRESHOLD)}%` 
            }} 
          />
        </div>
      </div>

      {!isActive && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-cinzel text-yellow-500/50 uppercase tracking-widest text-center px-4 bg-emerald-950/80">
          Activating...
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-cinzel text-red-400 uppercase tracking-widest text-center px-4 bg-emerald-950/90">
          {error}
        </div>
      )}
      
      <div className="absolute inset-0 border-[4px] border-double border-yellow-500/10 pointer-events-none" />
    </div>
  );
};

export default HandController;
