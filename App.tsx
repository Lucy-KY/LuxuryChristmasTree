
import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei';
import LuxuryTree from './components/LuxuryTree';
import PostProcessing from './components/PostProcessing';
import OverlayUI from './components/OverlayUI';
import { TreeState } from './types';
import { COLORS } from './constants';

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>(TreeState.CHAOS);
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const toggleTree = () => {
    setTreeState(prev => prev === TreeState.CHAOS ? TreeState.FORMED : TreeState.CHAOS);
  };

  const handlePhotoUpload = (url: string) => {
    setPhotos(prev => [...prev, url]);
  };

  return (
    <div className="h-screen w-screen bg-[#000502] overflow-hidden relative">
      {/* 3D Engine Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]} shadows>
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 5, 20]} fov={45} />
            <OrbitControls 
              autoRotate={treeState === TreeState.CHAOS} 
              autoRotateSpeed={0.5}
              enablePan={false}
              maxDistance={35}
              minDistance={10}
              target={[0, 6, 0]}
            />
            
            <color attach="background" args={[COLORS.BACKGROUND]} />
            
            {/* Ambient and Sparkle Lighting */}
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.5} color={COLORS.GOLD} />
            <spotLight position={[-10, 20, 10]} angle={0.15} penumbra={1} intensity={2} color="#ffffff" castShadow />
            
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

            <LuxuryTree 
              state={treeState} 
              onReady={() => setReady(true)} 
              photos={photos}
            />

            <PostProcessing />
          </Suspense>
        </Canvas>
      </div>

      {/* UI Interaction Layer */}
      <OverlayUI 
        treeState={treeState} 
        onToggleState={toggleTree} 
        onPhotoUpload={handlePhotoUpload}
      />

      {/* Loading Screen Overlay */}
      {!ready && (
        <div className="fixed inset-0 z-50 bg-[#000502] flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-r-2 border-yellow-500 rounded-full animate-spin" />
          <h2 className="font-pinyon text-4xl text-yellow-500 animate-pulse">Polishing Emeralds...</h2>
        </div>
      )}

      {/* Floating Sparkles in UI */}
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
