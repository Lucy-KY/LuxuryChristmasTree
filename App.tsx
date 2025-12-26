
import React, { useState, Suspense, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree, ThreeElements } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, useTexture } from '@react-three/drei';
import LuxuryTree, { TREE_RADIUS_FACTOR, TRANSITION_DURATION } from './components/LuxuryTree';
import PostProcessing from './components/PostProcessing';
import OverlayUI from './components/OverlayUI';
import HandController from './components/HandController';
import { TreeState } from './types';
import { COLORS, TREE_PARAMS } from './constants';
import * as THREE from 'three';

// Fix: Robust JSX augmentation to ensure Three.js intrinsic elements are recognized
// across different React and TypeScript configurations (targeting both global JSX and React.JSX).
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}

const FocusedPhoto: React.FC<{ url: string; index: number; onDismiss: () => void; treeRef: React.RefObject<THREE.Group> }> = ({ url, index, onDismiss, treeRef }) => {
  const texture = useTexture(url);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  // Initial wild rotation for cinematic entry
  const initialRot = useMemo(() => new THREE.Euler(
    (Math.random() - 0.5) * 1.5,
    (Math.random() - 0.5) * Math.PI * 2,
    (Math.random() - 0.5) * 1.5
  ), []);

  const startPos = useMemo(() => {
    const angle = (index * 1.5) + Math.PI;
    const h = 0.25 + (index * 0.12) % 0.55;
    const r = TREE_RADIUS_FACTOR(h);
    const local = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
    if (treeRef.current) {
      local.applyMatrix4(treeRef.current.matrixWorld);
    }
    return local;
  }, [index, treeRef]);

  const aspect = useMemo(() => {
    const img = texture.image as any;
    return (img && img.width && img.height) ? img.width / img.height : 1;
  }, [texture]);

  // Massive Scale base: 4/5 of screen height
  // User requested: 0.5x for horizontal, 0.8x for vertical relative to previous "doubled" state
  const finalFocusHeight = useMemo(() => {
    const distance = 4.5;
    const fovRad = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const frustumHeightAtDistance = 2 * distance * Math.tan(fovRad / 2);
    const baseFocusHeight = (frustumHeightAtDistance / 5) * 4;
    
    const multiplier = aspect > 1 ? 0.5 : 0.8;
    return baseFocusHeight * multiplier;
  }, [camera, aspect]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const speed = isClosing ? 1.8 : 0.7; // Even slower for "extra dramatic" arrival
    if (!isClosing) {
      if (progress < 1) setProgress(Math.min(1, progress + delta * speed));
    } else {
      if (progress > 0) {
        setProgress(Math.max(0, progress - delta * (speed * 1.4)));
      } else {
        // Snap back to the ornament's current world position to guarantee accuracy before dismiss
        try {
          if (treeRef.current) {
            const angle = (index * 1.5) + Math.PI;
            const h = 0.25 + (index * 0.12) % 0.55;
            const r = TREE_RADIUS_FACTOR(h);
            const finalPos = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
            finalPos.applyMatrix4(treeRef.current.matrixWorld);
            groupRef.current.position.copy(finalPos);
            // ensure scale and rotation are normalized
            groupRef.current.scale.set(1, 1, 1);
            groupRef.current.quaternion.set(0, 0, 0, 1);
          }
        } catch (e) {
          // ignore
        }
        onDismiss();
      }
    }

    // Target position (camera-space)
    const targetPos = new THREE.Vector3(0, 0, -4.5).applyQuaternion(camera.quaternion).add(camera.position);

    // ULTRA EXTRAVAGANT SWOOP
    const swoopIntensity = 6.0;
    const spiralIntensity = 4.0;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const startScale = 1.0;

    if (!isClosing) {
      // Opening path (startPos -> targetPos)
      const tOpen = 1 - Math.pow(1 - progress, 5);
      const currentPos = new THREE.Vector3().lerpVectors(startPos, targetPos, tOpen);
      const pathModifier = Math.sin(tOpen * Math.PI);
      currentPos.addScaledVector(right, pathModifier * swoopIntensity * (1 - tOpen));
      currentPos.addScaledVector(up, Math.cos(tOpen * Math.PI * 0.8) * spiralIntensity * (1 - tOpen));
      groupRef.current.position.copy(currentPos);

      // Rotation toward camera
      const targetQuat = camera.quaternion.clone();
      const currentQuat = new THREE.Quaternion().setFromEuler(initialRot).slerp(targetQuat, tOpen);
      groupRef.current.quaternion.copy(currentQuat);

      // Scale up
      const currentScale = THREE.MathUtils.lerp(startScale, finalFocusHeight, tOpen);
      groupRef.current.scale.set(currentScale * aspect, currentScale, 1);
    } else {
      // Closing path (targetPos -> startPos) with reversed, smoother easing
      const tClose = 1 - Math.pow(progress, 2.5); // 0 -> 1 as we close
      const currentPos = new THREE.Vector3().lerpVectors(targetPos, startPos, tClose);

      // reverse-sway that eases out as we approach the tree
      const pathModifier = Math.sin(tClose * Math.PI);
      currentPos.addScaledVector(right, pathModifier * swoopIntensity * (1 - tClose) * -0.6);
      currentPos.addScaledVector(up, Math.cos(tClose * Math.PI * 0.8) * spiralIntensity * (1 - tClose) * -0.6);
      groupRef.current.position.copy(currentPos);

      // Rotation: camera-aligned -> initial wild rotation
      const cameraQuat = camera.quaternion.clone();
      const targetQuatBack = new THREE.Quaternion().setFromEuler(initialRot);
      const currentQuat = cameraQuat.slerp(targetQuatBack, tClose);
      groupRef.current.quaternion.copy(currentQuat);

      // Scale down back to original
      const currentScale = THREE.MathUtils.lerp(finalFocusHeight, startScale, tClose);
      groupRef.current.scale.set(currentScale * aspect, currentScale, 1);
    }
  });

  useEffect(() => {
    const handleGlobalDismiss = () => setIsClosing(true);
    window.addEventListener('dismiss-photo', handleGlobalDismiss);
    return () => window.removeEventListener('dismiss-photo', handleGlobalDismiss);
  }, []);

  return (
    <group ref={groupRef} renderOrder={9999}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={texture} transparent opacity={1} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const Scene: React.FC<{
  treeState: TreeState;
  ready: boolean;
  setReady: (r: boolean) => void;
  photos: string[];
  focusedPhoto: string | null;
  setFocusedPhoto: (p: string | null) => void;
  rotationVelocity: React.MutableRefObject<number>;
  zoomTarget: React.MutableRefObject<number>;
  rotationGroupRef: React.MutableRefObject<THREE.Group>;
  onRegisterCamera: (cam: THREE.Camera) => void;
}> = ({ treeState, ready, setReady, photos, focusedPhoto, setFocusedPhoto, rotationVelocity, zoomTarget, rotationGroupRef, onRegisterCamera }) => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    onRegisterCamera(camera);
  }, [camera, onRegisterCamera]);
  
  useFrame((state, delta) => {
    if (!focusedPhoto) {
      if (rotationGroupRef.current) {
        rotationGroupRef.current.rotation.y += rotationVelocity.current * delta;
        rotationVelocity.current *= Math.pow(0.08, delta); 
      }
      if (controlsRef.current) {
        const currentDist = controlsRef.current.getDistance();
        const nextDist = THREE.MathUtils.lerp(currentDist, zoomTarget.current, 0.1);
        controlsRef.current.minDistance = nextDist;
        controlsRef.current.maxDistance = nextDist;
      }
    }
  });

  const ambientIntensity = focusedPhoto ? 0.005 : 0.15;
  const pointIntensity = focusedPhoto ? 0.02 : 0.8;
  const spotIntensity = focusedPhoto ? 0.05 : 1.2;

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 20]} fov={45} />
      <OrbitControls 
        ref={controlsRef}
        autoRotate={treeState === TreeState.CHAOS && !focusedPhoto && Math.abs(rotationVelocity.current) < 0.01} 
        autoRotateSpeed={0.5}
        enablePan={false}
        enabled={!focusedPhoto}
        maxDistance={35}
        minDistance={10}
        target={[0, 6, 0]}
      />
      <color attach="background" args={[COLORS.BACKGROUND]} />
      
      <ambientLight intensity={ambientIntensity} />
      <pointLight position={[10, 10, 10]} intensity={pointIntensity} color={COLORS.GOLD} />
      <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={spotIntensity} color="#ffffff" castShadow />
      
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      <group ref={rotationGroupRef}>
        <LuxuryTree 
          state={treeState} 
          onReady={() => setReady(true)} 
          photos={photos}
          focusedPhoto={focusedPhoto}
          onFocusPhoto={setFocusedPhoto}
        />
      </group>

      {focusedPhoto && (
        <FocusedPhoto 
          url={focusedPhoto} 
          index={photos.indexOf(focusedPhoto)} 
          onDismiss={() => setFocusedPhoto(null)} 
          treeRef={rotationGroupRef}
        />
      )}

      <PostProcessing />
    </>
  );
};

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>(TreeState.CHAOS);
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [focusedPhoto, setFocusedPhoto] = useState<string | null>(null);
  
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rotationGroupRef = useRef<THREE.Group>(null!);
  const rotationVelocity = useRef<number>(0);
  const zoomTarget = useRef<number>(20);

  const toggleTree = () => setTreeState(prev => prev === TreeState.CHAOS ? TreeState.FORMED : TreeState.CHAOS);
  const handlePhotoUpload = (url: string) => {
    console.log('[App] handlePhotoUpload called', { url, beforeCount: photos.length });
    setPhotos(prev => {
      const next = [...prev, url];
      console.log('[App] photos state will be', next.length);
      return next;
    });
  };

  // Debug: track photos updates
  useEffect(() => {
    console.log('[App] photos updated', photos);
  }, [photos]);

  // Load uploaded pictures from server on mount. These are treated as session-only decorations.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resp = await fetch('/api/pictures');
        if (!resp.ok) throw new Error('Failed to list pictures');
        const list: string[] = await resp.json();
        if (mounted && Array.isArray(list) && list.length > 0) {
          console.log('[App] fetched pictures from server', list);
          setPhotos(list);
        }
      } catch (err) {
        console.log('[App] could not fetch /api/pictures (server may be down), continuing with in-memory photos');
      }
    };
    load();

    const clearOnUnload = () => {
      try {
        // Try keepalive DELETE; fallback to POST clear endpoint using sendBeacon if not supported
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          // sendBeacon only supports POST; hit a clear endpoint for reliability
          navigator.sendBeacon('/api/pictures/clear');
        } else {
          fetch('/api/pictures', { method: 'DELETE', keepalive: true }).catch(()=>{});
        }
      } catch (e) { /* ignore */ }
    };

    window.addEventListener('pagehide', clearOnUnload);
    window.addEventListener('beforeunload', clearOnUnload);
    return () => { mounted = false; window.removeEventListener('pagehide', clearOnUnload); window.removeEventListener('beforeunload', clearOnUnload); };
  }, []);



  const handlePinchFocus = async () => {
    console.log('[App] handlePinchFocus called', { focusedPhoto, photoCount: photos.length, hasCamera: !!cameraRef.current, hasRotation: !!rotationGroupRef.current });
    if (focusedPhoto || !cameraRef.current || !rotationGroupRef.current) {
      console.log('[App] handlePinchFocus aborted early', { focusedPhoto, photoCount: photos.length, hasCamera: !!cameraRef.current, hasRotation: !!rotationGroupRef.current });
      return;
    }

    // If our in-memory photos are empty, try a quick server re-fetch before giving up (covers race conditions)
    let workingPhotos = photos;
    if (workingPhotos.length === 0) {
      try {
        const resp = await fetch('/api/pictures');
        if (resp.ok) {
          const list: string[] = await resp.json();
          if (Array.isArray(list) && list.length > 0) {
            console.log('[App] discovered server-side pictures on pinch; updating state', list);
            setPhotos(list);
            workingPhotos = list;
          }
        }
      } catch (err) {
        console.log('[App] error fetching /api/pictures during pinch', err);
      }

      if (workingPhotos.length === 0) {
        // brief grace window to allow in-flight uploads to finish and update component state
        console.log('[App] no photos found immediately; waiting briefly for in-flight uploads');
        await new Promise(res => setTimeout(res, 250));
        if (photos.length > 0) {
          console.log('[App] photos were added during wait; using updated photos', photos);
          workingPhotos = photos;
        }

        if (workingPhotos.length === 0) {
          console.log('[App] no photos present — pinch does nothing');
          return;
        }
      }
    }

    // Choose the photo nearest to the camera's view (screen-space closest to center). Fallback to nearest by world distance.
    let nearestUrl: string | null = null;
    let bestNdcDist = Infinity;
    let bestWorldDist = Infinity;

    workingPhotos.forEach((url, index) => {
      const angle = (index * 1.5) + Math.PI;
      const h = 0.25 + (index * 0.12) % 0.55;
      const r = TREE_RADIUS_FACTOR(h);
      const worldPos = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
      worldPos.applyMatrix4(rotationGroupRef.current.matrixWorld);

      const proj = worldPos.clone().project(cameraRef.current as any);
      const ndcDist = Math.hypot(proj.x, proj.y);
      const worldDist = worldPos.distanceTo(cameraRef.current.position);

      console.log('[App] photo projection', { index, url, ndcX: proj.x.toFixed(3), ndcY: proj.y.toFixed(3), ndcZ: proj.z.toFixed(3), ndcDist: ndcDist.toFixed(3), worldDist: worldDist.toFixed(2) });

      // Prefer visible objects (within NDC z range) and minimize screen distance
      if (Math.abs(proj.z) <= 1 && ndcDist < bestNdcDist) {
        bestNdcDist = ndcDist;
        bestWorldDist = worldDist;
        nearestUrl = url;
      } else if (!nearestUrl && worldDist < bestWorldDist) {
        // fallback to nearest by world distance if nothing was in view yet
        bestWorldDist = worldDist;
        nearestUrl = url;
      }
    });

    console.log('[App] nearest selection (screen focus)', { nearestUrl, bestNdcDist, bestWorldDist });

    // Accept if the chosen candidate is reasonably centered or sufficiently close in world space
    if (nearestUrl && (bestNdcDist < 0.6 || bestWorldDist < 18)) {
      console.log('[App] focusing photo', nearestUrl);
      setFocusedPhoto(nearestUrl);
    } else {
      console.log('[App] pinch did not find a good candidate (centered or near enough)');
    }
  };

  const handleDoublePinch = () => {
    console.log('[App] handleDoublePinch called', { focusedPhoto });
    if (focusedPhoto) {
      window.dispatchEvent(new Event('dismiss-photo'));
    }
  };

  return (
    <div className="h-screen w-screen bg-[#000502] overflow-hidden relative">
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]} shadows>
          <Suspense fallback={null}>
            <Scene 
              treeState={treeState}
              ready={ready}
              setReady={setReady}
              photos={photos}
              focusedPhoto={focusedPhoto}
              setFocusedPhoto={setFocusedPhoto}
              rotationVelocity={rotationVelocity}
              zoomTarget={zoomTarget}
              rotationGroupRef={rotationGroupRef}
              onRegisterCamera={(cam) => cameraRef.current = cam}
            />
          </Suspense>
        </Canvas>
      </div>

      <HandController 
        onGestureChaos={() => setTreeState(TreeState.CHAOS)}
        onGestureForm={() => setTreeState(TreeState.FORMED)}
        onDrag={(dx) => {
          if (!focusedPhoto) {
            const sensitivity = 11.31;
            if (rotationGroupRef.current) rotationGroupRef.current.rotation.y += dx * sensitivity;
            rotationVelocity.current = dx * 18.0; 
          }
        }}
        onZoom={(dy) => {
          if (!focusedPhoto) zoomTarget.current = Math.max(10, Math.min(35, zoomTarget.current + dy * 5));
        }}
        onPinch={handlePinchFocus}
        onDoublePinch={handleDoublePinch}
        isFocusActive={!!focusedPhoto}
        onPinchSwipeDismiss={() => window.dispatchEvent(new Event('dismiss-photo'))}
      />

      <OverlayUI 
        treeState={treeState} 
        onToggleState={toggleTree} 
        onPhotoUpload={handlePhotoUpload}
        isPhotoFocused={!!focusedPhoto}
        onClearFocus={() => window.dispatchEvent(new Event('dismiss-photo'))}
      />

      {!ready && (
        <div className="fixed inset-0 z-50 bg-[#000502] flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-r-2 border-yellow-500 rounded-full animate-spin" />
          <h2 className="font-pinyon text-4xl text-yellow-500 animate-pulse">Polishing Emeralds...</h2>
        </div>
      )}
    </div>
  );
};

export default App;
