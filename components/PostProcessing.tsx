
import React from 'react';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';

const PostProcessing: React.FC = () => {
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom 
        intensity={0.25} // Minimal intensity to eliminate distortion/blur on photos
        luminanceThreshold={0.7} // Very high threshold to keep standard colors untouched
        luminanceSmoothing={0.9} 
        mipmapBlur 
      />
      <Vignette eskil={false} offset={0.2} darkness={1.4} />
      <Noise opacity={0.01} />
      <ChromaticAberration offset={[0.0004, 0.0004]} />
    </EffectComposer>
  );
};

export default PostProcessing;
