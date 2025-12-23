
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

const FocusedPhoto: React.FC<{ url: string; index: number; onDismiss: () => void; treeRef: React.RefObject<THREE.Group> }> = ({ url, index, onDismiss, treeRef }) => {
  const texture = useTexture(url);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const [progress, setProgress] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  // Capture world starting position on mount to ensure pop-out is seamless
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
    if (img && img.width && img.height) {
      return img.width / img.height;
    }
    return 1;
  }, [texture]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!isClosing) {
      if (progress < 1) setProgress(Math.min(1, progress + delta / TRANSITION_DURATION));
    } else {
      if (progress > 0) {
        setProgress(Math.max(0, progress - delta / TRANSITION_DURATION));
      } else {
        onDismiss();
      }
    }

    const t = isClosing 
      ? Math.pow(progress, 4) 
      : 1 - Math.pow(1 - progress, 4);

    // Target is ALWAYS the center of the viewport (fixed relative to camera)
    const targetPos = new THREE.Vector3(0, 0, -5);
    targetPos.applyQuaternion(camera.quaternion);
    targetPos.add(camera.position);

    groupRef.current.position.lerpVectors(startPos, targetPos, t);
    const lookAtQuat = camera.quaternion.clone();
    groupRef.current.quaternion.slerp(lookAtQuat, t);

    const s = THREE.MathUtils.lerp(1.2, 3.2, t);
    groupRef.current.scale.set(s * aspect, s, 1);
  });

  const handleDismiss = (e: any) => {
    e.stopPropagation();
    setIsClosing(true);
  };

  return (
    <group ref={groupRef} onClick={handleDismiss} renderOrder={9999}>
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={texture} transparent opacity={1} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshPhysicalMaterial 
          color={COLORS.GOLD} 
          metalness={1.0} 
          roughness={0.02} 
          emissive={COLORS.GOLD} 
          emissiveIntensity={1.5}
          depthTest={false}
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
  controlsRef: React.MutableRefObject<any>;
  rotationGroupRef: React.MutableRefObject<THREE.Group>;
}> = ({ treeState, ready, setReady, photos, focusedPhoto, setFocusedPhoto, rotationVelocity, zoomTarget, controlsRef, rotationGroupRef }) => {
  
  useFrame((state, delta) => {
    if (!focusedPhoto) {
      if (rotationGroupRef.current) {
        rotationGroupRef.current.rotation.y += rotationVelocity.current * delta;
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
        autoRotate={treeState === TreeState.CHAOS && !focusedPhoto && Math.abs(rotationVelocity.current) < 0.01} 
        autoRotateSpeed={0.5}
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

      {/* Rotating Tree Container */}
      <group ref={rotationGroupRef}>
        <LuxuryTree 
          state={treeState} 
          onReady={() => setReady(true)} 
          photos={photos}
          focusedPhoto={focusedPhoto}
          onFocusPhoto={setFocusedPhoto}
        />
      </group>

      {/* Static Focused View (Outside rotating group) */}
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
  
  const controlsRef = useRef<any>(null);
  const rotationGroupRef = useRef<THREE.Group>(null!);
  const rotationVelocity = useRef<number>(0);
  const zoomTarget = useRef<number>(20);

  const toggleTree = () => {
    setTreeState(prev => prev === TreeState.CHAOS ? TreeState.FORMED : TreeState.CHAOS);
  };

  const handlePhotoUpload = (url: string) => {
    setPhotos(prev => [...prev, url]);
  };

  const handleDoublePinch = () => {
    if (focusedPhoto) {
      setFocusedPhoto(null);
    } else if (photos.length > 0) {
      setFocusedPhoto(photos[photos.length - 1]);
    }
  };

  useEffect(() => {
    if (focusedPhoto) {
      setGreeting("Reading the stars...");
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
              controlsRef={controlsRef}
              rotationGroupRef={rotationGroupRef}
            />
          </Suspense>
        </Canvas>
      </div>

      <HandController 
        onGestureChaos={() => setTreeState(TreeState.CHAOS)}
        onGestureForm={() => setTreeState(TreeState.FORMED)}
        onDrag={(dx) => {
          if (!focusedPhoto) {
            // Increased multiplier from 2.0 to 4.0 to double the rotation amplitude as requested.
            rotationVelocity.current = dx * 4.0; 
          }
        }}
        onZoom={(dy) => {
          if (!focusedPhoto) {
            zoomTarget.current = Math.max(10, Math.min(35, zoomTarget.current + dy * 5));
          }
        }}
        onDoublePinch={handleDoublePinch}
      />

      <OverlayUI 
        treeState={treeState} 
        onToggleState={toggleTree} 
        onPhotoUpload={handlePhotoUpload}
        isPhotoFocused={!!focusedPhoto}
        onClearFocus={() => setFocusedPhoto(null)}
        greeting={greeting}
      />

      {!ready && (
        <div className="fixed inset-0 z-50 bg-[#000502] flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-r-2 border-yellow-500 rounded-full animate-spin" />
          <h2 className="font-pinyon text-4xl text-yellow-500 animate-pulse">Polishing Emeralds...</h2>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none opacity-40">
        {[...Array(20)].map((_, i) => (
          <div 
            key={i}
            className="absolute rounded-full bg-yellow-400 blur-[2px] animate-pulse"
            style={{
              width: Math.random() * 4 + 'px',
              height: Math.random() * 4 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              animationDelay: Math.random() * 5 + 's',
              animationDuration: Math.random() * 3 + 2 + 's'
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default App;
