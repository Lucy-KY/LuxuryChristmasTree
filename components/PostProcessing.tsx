
import React from 'react';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';

const PostProcessing: React.FC = () => {
  return (
    // Fix: Replaced the non-existent 'disableNormalPass' with 'enableNormalPass={false}' as suggested by the error message.
    <EffectComposer enableNormalPass={false}>
      <Bloom 
        intensity={1.5} 
        luminanceThreshold={0.4} 
        luminanceSmoothing={0.9} 
        mipmapBlur 
      />
      <Vignette eskil={false} offset={0.1} darkness={1.1} />
      <Noise opacity={0.02} />
      <ChromaticAberration offset={[0.001, 0.001]} />
    </EffectComposer>
  );
};

export default PostProcessing;
