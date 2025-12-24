
import React, { useState, Suspense, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, useTexture } from '@react-three/drei';
import LuxuryTree, { TREE_RADIUS_FACTOR, TRANSITION_DURATION } from './components/LuxuryTree';
import PostProcessing from './components/PostProcessing';
import OverlayUI from './components/OverlayUI';
import HandController from './components/HandController';
import { TreeState } from './types';
import { COLORS, TREE_PARAMS } from './constants';
import { generateGreeting } from './services/geminiService';
import * as THREE from 'three';

const FOCUS_DIST = 8; // Distance in front of camera

const FocusedPhoto: React.FC<{ url: string; index: number; onDismiss: () => void; treeRef: React.RefObject<THREE.Group> }> = ({ url, index, onDismiss, treeRef }) => {
  const texture = useTexture(url);
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  
  const startPos = useRef(new THREE.Vector3());
  const startQuat = useRef(new THREE.Quaternion());

  useEffect(() => {
    if (treeRef.current) {
      treeRef.current.updateMatrixWorld();
      const angle = (index * 1.5) + Math.PI;
      const h = 0.25 + (index * 0.12) % 0.55;
      const r = TREE_RADIUS_FACTOR(h);
      const local = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
      startPos.current.copy(local).applyMatrix4(treeRef.current.matrixWorld);
      startQuat.current.setFromRotationMatrix(treeRef.current.matrixWorld);
    }
  }, [index, treeRef]);

  const aspect = useMemo(() => {
    const img = texture.image as any;
    return (img && img.width) ? img.width / img.height : 1;
  }, [texture]);

  // Accurate responsive scale based on screen dimensions and camera FOV
  const targetScale = useMemo(() => {
    const pCam = camera as THREE.PerspectiveCamera;
    const fovRad = (pCam.fov * Math.PI) / 180;
    
    // Height of the full viewport at FOCUS_DIST units away
    const viewportHeightAtDist = 2 * Math.tan(fovRad / 2) * FOCUS_DIST;
    const viewportWidthAtDist = viewportHeightAtDist * (size.width / size.height);
    
    // User Constraint: H <= 1/2 screen height, W <= 1/3 screen width
    const maxH = viewportHeightAtDist * 0.5;
    const maxW = viewportWidthAtDist * 0.33;
    
    let finalH = maxH;
    let finalW = finalH * aspect;
    
    // Fit to width if aspect is too wide
    if (finalW > maxW) {
      finalW = maxW;
      finalH = finalW / aspect;
    }
    
    return { w: finalW, h: finalH };
  }, [camera, size, aspect]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!isClosing) {
      if (progress < 1) setProgress(Math.min(1, progress + delta / TRANSITION_DURATION));
    } else {
      if (progress > 0) setProgress(Math.max(0, progress - delta / TRANSITION_DURATION));
      else onDismiss();
    }

    const t = isClosing ? Math.pow(progress, 3) : 1 - Math.pow(1 - progress, 3);

    // Target position is exactly in the center of the camera's view
    const targetPos = new THREE.Vector3(0, 0, -FOCUS_DIST);
    targetPos.applyQuaternion(camera.quaternion);
    targetPos.add(camera.position);

    groupRef.current.position.lerpVectors(startPos.current, targetPos, t);
    
    const lookAtQuat = camera.quaternion.clone();
    groupRef.current.quaternion.slerpQuaternions(startQuat.current, lookAtQuat, t);

    // Scale from original (1.2) to responsive target
    groupRef.current.scale.set(
      THREE.MathUtils.lerp(1.2, targetScale.w, t),
      THREE.MathUtils.lerp(1.2, targetScale.h, t),
      1
    );
  });

  useEffect(() => {
    const handleGlobalDismiss = () => setIsClosing(true);
    window.addEventListener('dismiss-photo', handleGlobalDismiss);
    return () => window.removeEventListener('dismiss-photo', handleGlobalDismiss);
  }, []);

  return (
    <group ref={groupRef} renderOrder={10000}>
      {/* Front Mesh: The Photo */}
      <mesh renderOrder={10001}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial 
          map={texture} 
          transparent 
          opacity={Math.min(1, progress * 1.5)} 
          depthTest={false} 
          depthWrite={false}
          side={THREE.DoubleSide} 
        />
      </mesh>
      
      {/* Glow Border Mesh: High emissive for Bloom effect */}
      <mesh position={[0, 0, -0.01]} renderOrder={10000}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshPhysicalMaterial 
          color={COLORS.GOLD} 
          metalness={1.0} 
          roughness={0.0} 
          emissive={COLORS.GOLD} 
          emissiveIntensity={10 * progress} // Glow builds up during transition
          transparent
          opacity={Math.min(1, progress * 1.5)}
          depthTest={false}
          depthWrite={false}
        />
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
        const idleRotationSpeed = 0.06;
        rotationGroupRef.current.rotation.y += (rotationVelocity.current + idleRotationSpeed) * delta;
        rotationVelocity.current *= Math.pow(0.05, delta); 
      }
      if (controlsRef.current) {
        const currentDist = controlsRef.current.getDistance();
        const nextDist = THREE.MathUtils.lerp(currentDist, zoomTarget.current, 0.1);
        controlsRef.current.minDistance = nextDist;
        controlsRef.current.maxDistance = nextDist;
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 5, 20]} fov={45} />
      <OrbitControls 
        ref={controlsRef}
        autoRotate={false} 
        enablePan={false}
        enabled={!focusedPhoto}
        maxDistance={35}
        minDistance={10}
        target={[0, 6, 0]}
      />
      <color attach="background" args={[COLORS.BACKGROUND]} />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1.5} color={COLORS.GOLD} />
      <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={2} color="#ffffff" castShadow />
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
  const [greeting, setGreeting] = useState<string>("");
  
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

  const handlePinchFocus = () => {
    if (focusedPhoto || photos.length === 0 || !cameraRef.current || !rotationGroupRef.current) {
      return;
    }

    rotationGroupRef.current.updateMatrixWorld();

    let nearestUrl = null;
    let minDist = Infinity;

    photos.forEach((url, index) => {
      const angle = (index * 1.5) + Math.PI;
      const h = 0.25 + (index * 0.12) % 0.55;
      const r = TREE_RADIUS_FACTOR(h);
      const worldPos = new THREE.Vector3(Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r);
      
      worldPos.applyMatrix4(rotationGroupRef.current.matrixWorld);
      
      const dist = worldPos.distanceTo(cameraRef.current.position);
      if (dist < minDist) {
        minDist = dist;
        nearestUrl = url;
      }
    });

    if (nearestUrl) {
      setFocusedPhoto(nearestUrl);
    }
  };

  useEffect(() => {
    if (focusedPhoto) {
      setGreeting("Decrypting emerald cosmic frequencies...");
      generateGreeting("Honored Guest").then(res => setGreeting(res));
    } else {
      setGreeting("");
    }
  }, [focusedPhoto]);

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
        onGestureChaos={() => {
          if (treeState !== TreeState.CHAOS) setTreeState(TreeState.CHAOS);
        }}
        onGestureForm={() => {
          if (treeState !== TreeState.FORMED) setTreeState(TreeState.FORMED);
        }}
        onDrag={(dx) => {
          if (!focusedPhoto) {
            const sensitivity = 12.0;
            if (rotationGroupRef.current) rotationGroupRef.current.rotation.y += dx * sensitivity;
            rotationVelocity.current = dx * 18.0; 
          }
        }}
        onZoom={(dy) => {
          if (!focusedPhoto) zoomTarget.current = Math.max(10, Math.min(35, zoomTarget.current + dy * 6));
        }}
        onDoublePinch={handleDoublePinch}
        onPinch={handlePinchFocus} 
      />

      <OverlayUI 
        treeState={treeState} 
        onToggleState={toggleTree} 
        onPhotoUpload={handlePhotoUpload}
        isPhotoFocused={!!focusedPhoto}
        onClearFocus={() => window.dispatchEvent(new Event('dismiss-photo'))}
        greeting={greeting}
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
