
import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

interface HandControllerProps {
  onGestureChaos: () => void;
  onGestureForm: () => void;
  onDrag: (dx: number) => void;
  onZoom: (dy: number) => void;
  onPinch: () => void;
  onDoublePinch: () => void;
  isFocusActive: boolean;
  onPinchSwipeDismiss: () => void;
}

const HandController: React.FC<HandControllerProps> = ({ 
  onGestureChaos, 
  onGestureForm, 
  onDrag, 
  onZoom, 
  onPinch,
  onDoublePinch,
  isFocusActive,
  onPinchSwipeDismiss
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const lastGestureTimeRef = useRef<number>(0);
  const lastXRef = useRef<number | null>(null);
  const lastYRef = useRef<number | null>(null);
  
  // Gesture state tracking
  const isPinchingRef = useRef<boolean>(false);
  // pinch swipe removed per request; keep stabilization counters
  const pinchFramesRef = useRef<number>(0);
  const pinchLostRef = useRef<number>(0);
  const lastPinchTimeRef = useRef<number>(0);
  const pinchStartXRef = useRef<number | null>(null);
  
  const STABILITY_THRESHOLD = 5; 
  const COOLDOWN_MS = 5000;
  const dualOpenFramesRef = useRef<number>(0);
  const fistStateFramesRef = useRef<number>(0);
  const openFramesRef = useRef<number>(0); // consecutive open-hand frames

  const [isActive, setIsActive] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<'none' | 'chaos' | 'form' | 'pinch'>('none');

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
    const now = Date.now();
    if (now - lastGestureTimeRef.current < COOLDOWN_MS) {
      setGestureStatus('none');
      // keep sensors quiet during cooldown
      pinchFramesRef.current = 0;
      pinchLostRef.current = 0;
      openFramesRef.current = 0;
      fistStateFramesRef.current = 0;
      dualOpenFramesRef.current = 0;
      isPinchingRef.current = false;
      pinchStartXRef.current = null;
      lastXRef.current = null;
      lastYRef.current = null;
      return; // ignore all recognition during cooldown
    }

    const hands = results.landmarks;
    
    const isFist = (h: any[]) => {
      const fingers = [8, 12, 16, 20];
      const bases = [5, 9, 13, 17];
      // Use tighter threshold to avoid misclassifying pinching frames as fists
      return fingers.every((tip, idx) => {
        const dist = Math.hypot(h[tip].x - h[bases[idx]].x, h[tip].y - h[bases[idx]].y);
        return dist < 0.1; 
      });
    };

    const isPinch = (h: any[]) => {
      // Require tighter thumb-index contact and ensure other fingers are not tightly closed (avoid fist confusion)
      const pinchDist = Math.hypot(h[4].x - h[8].x, h[4].y - h[8].y);
      if (pinchDist > 0.05) return false; // stricter

      const others = [12, 16, 20];
      const othersBases = [9, 13, 17];
      const othersAvg = others.reduce((acc, tip, idx) => {
        const d = Math.hypot(h[tip].x - h[othersBases[idx]].x, h[tip].y - h[othersBases[idx]].y);
        return acc + d;
      }, 0) / others.length;

      console.log('[HandController] pinch metrics', { pinchDist: pinchDist.toFixed(4), othersAvg: othersAvg.toFixed(4) });
      return true;
    };

    const isOpen = (h: any[]) => {
      const tips = [8, 12, 16, 20];
      const wrist = h[0];
      const dists = tips.map(tip => Math.hypot(h[tip].x - wrist.x, h[tip].y - wrist.y));
      const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
      // Slightly stricter open-hand threshold (reduces false positives when hand is partially open)
      return avg > 0.20;
    };

    if (!hands || hands.length === 0) {
      setGestureStatus('none');
      isPinchingRef.current = false;
      pinchStartXRef.current = null;
      lastXRef.current = null;
      lastYRef.current = null;
      return;
    }

    if (hands.length === 2 && isOpen(hands[0]) && isOpen(hands[1])) {
      dualOpenFramesRef.current++;
      setGestureStatus('chaos');
      if (dualOpenFramesRef.current > STABILITY_THRESHOLD) {
        onGestureChaos();
        lastGestureTimeRef.current = now;
        dualOpenFramesRef.current = 0;
      }
      return;
    }

    const activeHand = hands[0];
    const fistNow = isFist(activeHand);
    const pinchCandidate = isPinch(activeHand);

    // Maintain a short stabilization counter for pinch detection
    if (pinchCandidate) {
      pinchFramesRef.current++;
      pinchLostRef.current = 0;
    } else {
      // decay faster so brief openings quickly cancel a pinch
      pinchFramesRef.current = Math.max(0, pinchFramesRef.current - 2);
      pinchLostRef.current++;
    }

    // Track consecutive open-hand frames; only clear pinch after a couple of open frames
    if (isOpen(activeHand)) {
      openFramesRef.current++;
    } else {
      openFramesRef.current = 0;
    }

    if (openFramesRef.current >= 2) {
      if (pinchFramesRef.current > 0 || isPinchingRef.current) console.log('[HandController] open-hand -> clearing pinch state', { openFrames: openFramesRef.current });
      pinchFramesRef.current = 0;
      pinchLostRef.current = STABILITY_THRESHOLD;
      isPinchingRef.current = false;
      setGestureStatus('none');
      pinchStartXRef.current = null;
      lastXRef.current = null;
      lastYRef.current = null;
      // don't return here; continue to let open hand allow drag/zoom on same frame
    }

    // Only treat as pinching when candidate is stable for several frames and not a fist
    const pinchingNow = (!fistNow) && (pinchFramesRef.current >= 2); // reduce required frames to 2 for snappier response
    
    // If pinching now, set UI state early so tracker shows 'fetch picture'
    if (pinchingNow) {
      setGestureStatus('pinch');
      console.log('[HandController] pinchingNow', { frames: pinchFramesRef.current, fistNow });
    }

    // Use the index finger tip for swipe detection as it's more stable during pinch
    const currentX = activeHand[8].x;
    const currentY = activeHand[8].y;

    // Only clear pinchStartXRef if pinch has been lost for a few frames (avoid flicker during movement)
    if (pinchLostRef.current > 2) {
      pinchStartXRef.current = null;
    }

    if (lastXRef.current !== null) {
      const dx = currentX - lastXRef.current;
      const dy = currentY - lastYRef.current;

      if (fistNow) {
        setGestureStatus('form');
        fistStateFramesRef.current++;
        if (fistStateFramesRef.current > STABILITY_THRESHOLD) {
          onGestureForm();
          lastGestureTimeRef.current = now;
          fistStateFramesRef.current = 0;
        }
      } else {
        fistStateFramesRef.current = 0;
        if (pinchingNow) {
          setGestureStatus('pinch');
          // No pinch-movement dismiss behavior (user requested deletion of pinch movement).
        } else if (isOpen(activeHand)) {
          if (Math.abs(dx) > Math.abs(dy)) onDrag(-dx);
          else onZoom(dy * 1.5);
          setGestureStatus('none');
        } else {
          setGestureStatus('none');
        }
      }
    }

    // Trigger Initial Pinch / Double-Pinch Events when stabilized
    if (pinchingNow && !isPinchingRef.current) {
      if (now - lastPinchTimeRef.current < 450) {
        console.log('[HandController] double pinch -> onDoublePinch');
        onDoublePinch();
        lastGestureTimeRef.current = now;
        lastPinchTimeRef.current = 0;
      } else {
        console.log('[HandController] single pinch -> onPinch', { pinchFrames: pinchFramesRef.current, isFocusActive, x: currentX, y: currentY });
        onPinch();
        lastGestureTimeRef.current = now;
        lastPinchTimeRef.current = now;
      }
    }

    lastXRef.current = currentX;
    lastYRef.current = currentY;
    isPinchingRef.current = pinchingNow;

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
    }
  };
  
  const drawWireframe = (ctx: CanvasRenderingContext2D, landmarks: any[][]) => {
    let strokeColor = '#FFD700';
    if (gestureStatus === 'pinch') strokeColor = '#fef08a';
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
           gestureStatus === 'pinch' ? 'Fetch Picture' : 
           gestureStatus === 'form' ? 'Forming Tree' :
           'Tracking Active'}
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
