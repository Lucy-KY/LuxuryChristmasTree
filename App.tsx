
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
        onDismiss();
      }
    }

    // High-precision easing
    const t = isClosing 
      ? Math.pow(progress, 2.5) 
      : 1 - Math.pow(1 - progress, 5);

    // Target position
    const targetPos = new THREE.Vector3(0, 0, -4.5);
    targetPos.applyQuaternion(camera.quaternion);
    targetPos.add(camera.position);

    // ULTRA EXTRAVAGANT SWOOP
    // Widened trajectory with multiple harmonics
    const swoopIntensity = 6.0;
    const spiralIntensity = 4.0;
    
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    
    const currentPos = new THREE.Vector3().lerpVectors(startPos, targetPos, t);
    
    // Add sinusoidal sway and spiral to path
    const pathModifier = Math.sin(t * Math.PI);
    currentPos.addScaledVector(right, pathModifier * swoopIntensity * (1 - t));
    currentPos.addScaledVector(up, Math.cos(t * Math.PI * 0.8) * spiralIntensity * (1 - t));

    groupRef.current.position.copy(currentPos);
    
    // Rotation: Unroll from wild initial to camera-aligned
    const targetQuat = camera.quaternion.clone();
    const currentQuat = new THREE.Quaternion().setFromEuler(initialRot).slerp(targetQuat, t);
    groupRef.current.quaternion.copy(currentQuat);

    // Scaling
    const startScale = 1.0; 
    const currentScale = THREE.MathUtils.lerp(startScale, finalFocusHeight, t);
    groupRef.current.scale.set(currentScale * aspect, currentScale, 1);
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
  const handlePhotoUpload = (url: string) => setPhotos(prev => [...prev, url]);

  const handleDoublePinch = () => {
    if (focusedPhoto) {
      window.dispatchEvent(new Event('dismiss-photo'));
    }
  };

  const isFetchingSamplesRef = useRef(false);
  const fetchSamplePhotos = async (): Promise<string[]> => {
    if (isFetchingSamplesRef.current) return [];
    isFetchingSamplesRef.current = true;
    try {
      const sampleCount = 6;
      const samples = Array.from({ length: sampleCount }, (_, i) => `https://picsum.photos/seed/luxury-${i}/1024/1024`);
      setPhotos(prev => [...prev, ...samples]);
      console.log('[App] sample photos injected', samples);
      return samples;
    } catch (err) {
      console.error('[App] failed to fetch sample photos', err);
      return [];
    } finally {
      isFetchingSamplesRef.current = false;
    }
  };

  const handlePinchFocus = async () => {
    console.log('[App] handlePinchFocus called', { focusedPhoto, photoCount: photos.length, hasCamera: !!cameraRef.current, hasRotation: !!rotationGroupRef.current });
    if (focusedPhoto || !cameraRef.current || !rotationGroupRef.current) {
      console.log('[App] handlePinchFocus aborted early', { focusedPhoto, photoCount: photos.length, hasCamera: !!cameraRef.current, hasRotation: !!rotationGroupRef.current });
      return;
    }

    let workingPhotos = photos;

    if (workingPhotos.length === 0) {
      console.log('[App] no photos present — loading sample photos');
      const samples = await fetchSamplePhotos();
      if (samples.length === 0) {
        console.log('[App] no samples could be loaded; aborting pinch focus');
        return;
      }
      workingPhotos = samples;
    }

    let nearestUrl: string | null = null;
    let minDist = Infinity;

    workingPhotos.forEach((url, index) => {
      const angle = (index * 1.5) + Math.PI;
      const h = 0.25 + (index * 0.12) % 0.55;
      const r = TREE_RADIUS_FACTOR(h);
      const localPos = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
      localPos.applyMatrix4(rotationGroupRef.current.matrixWorld);
      
      const dist = localPos.distanceTo(cameraRef.current.position);
      console.log('[App] photo', { index, url, dist });
      if (dist < minDist) {
        minDist = dist;
        nearestUrl = url;
      }
    });

    console.log('[App] nearest selection', { nearestUrl, minDist });
    if (nearestUrl && minDist < 25) {
      console.log('[App] focusing photo', nearestUrl); 
      setFocusedPhoto(nearestUrl);
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
        onDoublePinch={handleDoublePinch}
        onPinch={handlePinchFocus} 
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
