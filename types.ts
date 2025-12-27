
export enum TreeState {
  CHAOS = 'CHAOS',
  FORMED = 'FORMED'
}

export interface OrnamentData {
  id: string;
  type: 'sphere' | 'box' | 'star' | 'photo' | 'heptagram';
  position: [number, number, number];
  chaosPosition?: [number, number, number];
  color: string;
  weight: number; // 0.1 (light) to 1.0 (heavy)
  url?: string;
  aspect?: number;
}

export interface ParticleConfig {
  count: number;
  positions: Float32Array;
  colors: Float32Array;
  targetPositions: Float32Array;
  chaosPositions: Float32Array;
}
