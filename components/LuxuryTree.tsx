
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState, OrnamentData } from '../types';
import { COLORS, PARTICLE_COUNTS, TREE_PARAMS } from '../constants';
import { Float, useTexture } from '@react-three/drei';

interface LuxuryTreeProps {
  state: TreeState;
  onReady: () => void;
  photos: string[];
}

const StarTopGeometry = () => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const points = 5;
    const outerRadius = 0.85;
    const innerRadius = 0.35;
    for (let i = 0; i <= points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / points) * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return s;
  }, []);
  return <extrudeGeometry args={[shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 }]} />;
};

const LuxuryTree: React.FC<LuxuryTreeProps> = ({ state, onReady, photos }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const trunkRef = useRef<THREE.Points>(null!);
  const ribbonPointsRef = useRef<THREE.Points>(null!);
  const snowBaseRef = useRef<THREE.Points>(null!);
  const ornamentsGroupRef = useRef<THREE.Group>(null!);
  const starRef = useRef<THREE.Mesh>(null!);
  const [transition, setTransition] = useState(0);

  // General Particles (Foliage, Trunk, Ribbons, Snow Base)
  const particles = useMemo(() => {
    const foliagePos = new Float32Array(PARTICLE_COUNTS.FOLIAGE * 3);
    const foliageChaos = new Float32Array(PARTICLE_COUNTS.FOLIAGE * 3);
    const foliageColors = new Float32Array(PARTICLE_COUNTS.FOLIAGE * 3);
    
    const trunkPos = new Float32Array(PARTICLE_COUNTS.TRUNK * 3);
    const trunkChaos = new Float32Array(PARTICLE_COUNTS.TRUNK * 3);
    const trunkColors = new Float32Array(PARTICLE_COUNTS.TRUNK * 3);

    const ribbonPos = new Float32Array(PARTICLE_COUNTS.RIBBON * 3);
    const ribbonChaos = new Float32Array(PARTICLE_COUNTS.RIBBON * 3);

    const snowBasePos = new Float32Array(PARTICLE_COUNTS.SNOW_BASE * 3);
    const snowBaseChaos = new Float32Array(PARTICLE_COUNTS.SNOW_BASE * 3);

    const goldColor = new THREE.Color(COLORS.GOLD);
    const emeraldColor = new THREE.Color(COLORS.EMERALD);
    const lightEmerald = new THREE.Color(COLORS.LIGHT_EMERALD);
    const brownColor = new THREE.Color(COLORS.BROWN);

    // Foliage Sawtooth Pine Logic - High Density
    for (let i = 0; i < PARTICLE_COUNTS.FOLIAGE; i++) {
      const i3 = i * 3;
      const hPct = Math.random();
      const y = hPct * TREE_PARAMS.HEIGHT;
      const tierSize = TREE_PARAMS.HEIGHT / TREE_PARAMS.TIERS;
      const tierProgress = (y % tierSize) / tierSize;
      const baseR = TREE_PARAMS.BASE_RADIUS * Math.pow(1 - hPct, 0.95);
      const sawtooth = 1 - (tierProgress * TREE_PARAMS.SAWTOOTH_DEPTH);
      
      const spread = (0.3 + 0.7 * Math.pow(Math.random(), 1.5));
      const r = (baseR * sawtooth + Math.sin(hPct * 50 + (i % 30)) * 0.12) * spread;
      const angle = Math.random() * Math.PI * 2;
      
      foliagePos[i3] = Math.cos(angle) * r;
      foliagePos[i3 + 1] = y;
      foliagePos[i3 + 2] = Math.sin(angle) * r;

      const chaosPhi = Math.acos(2 * Math.random() - 1);
      const chaosTheta = Math.random() * Math.PI * 2;
      const chaosR = 9 + Math.random() * 5;
      foliageChaos[i3] = chaosR * Math.sin(chaosPhi) * Math.cos(chaosTheta);
      foliageChaos[i3 + 1] = chaosR * Math.sin(chaosPhi) * Math.sin(chaosTheta) + 6;
      foliageChaos[i3 + 2] = chaosR * Math.cos(chaosPhi);

      const colorRoll = Math.random();
      let c = emeraldColor;
      if (colorRoll > 0.96) c = goldColor;
      else if (colorRoll > 0.75) c = lightEmerald;
      foliageColors[i3] = c.r;
      foliageColors[i3 + 1] = c.g;
      foliageColors[i3 + 2] = c.b;
    }

    // Trunk Particles
    for (let i = 0; i < PARTICLE_COUNTS.TRUNK; i++) {
      const i3 = i * 3;
      const y = (Math.random() * 2.2) - 1.5; 
      let r, x, z;
      if (y < 0) {
        const spiral = y * 5;
        r = 0.5 - y * 1.5;
        x = Math.cos(spiral + i * 0.02) * r;
        z = Math.sin(spiral + i * 0.02) * r;
      } else {
        r = 0.35 * Math.pow(Math.random(), 0.5);
        const angle = Math.random() * Math.PI * 2;
        x = Math.cos(angle) * r;
        z = Math.sin(angle) * r;
      }
      trunkPos[i3] = x;
      trunkPos[i3 + 1] = y;
      trunkPos[i3 + 2] = z;

      const chaosAngle = Math.random() * Math.PI * 2;
      const chaosR = 5 + Math.random() * 2;
      trunkChaos[i3] = Math.cos(chaosAngle) * chaosR;
      trunkChaos[i3 + 1] = (Math.random() - 0.5) * 12;
      trunkChaos[i3 + 2] = Math.sin(chaosAngle) * chaosR;

      trunkColors[i3] = brownColor.r;
      trunkColors[i3 + 1] = brownColor.g;
      trunkColors[i3 + 2] = brownColor.b;
    }

    // Ribbon Particles
    const perRibbon = PARTICLE_COUNTS.RIBBON / 2;
    for (let rIdx = 0; rIdx < 2; rIdx++) {
      const offset = rIdx * Math.PI;
      for (let i = 0; i < perRibbon; i++) {
        const i3 = (rIdx * perRibbon + i) * 3;
        const t = i / perRibbon;
        const y = t * TREE_PARAMS.HEIGHT;
        const spiralAngle = t * Math.PI * 2 * TREE_PARAMS.RIBBON_SPIRALS + offset;
        const radius = TREE_PARAMS.BASE_RADIUS * Math.pow(1 - t, 0.7) * 1.15;
        
        ribbonPos[i3] = Math.cos(spiralAngle) * radius + (Math.random() - 0.5) * 0.5;
        ribbonPos[i3 + 1] = y + (Math.random() - 0.5) * 0.5;
        ribbonPos[i3 + 2] = Math.sin(spiralAngle) * radius + (Math.random() - 0.5) * 0.5;

        const cRadius = 10 + Math.random() * 4;
        const cAngle = Math.random() * Math.PI * 2;
        ribbonChaos[i3] = Math.cos(cAngle) * cRadius;
        ribbonChaos[i3 + 1] = (Math.random() - 0.5) * 20 + 6;
        ribbonChaos[i3 + 2] = Math.sin(cAngle) * cRadius;
      }
    }

    // Snow Base Logic - Irregular Snowy Mound
    for (let i = 0; i < PARTICLE_COUNTS.SNOW_BASE; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 0.5) * 10;
      // Height of the mound based on distance to center
      const noise = (Math.sin(angle * 3) + Math.sin(dist * 2)) * 0.2;
      const h = Math.max(0, (1 - dist / 10) * 1.2) + noise - 1.8;
      
      snowBasePos[i3] = Math.cos(angle) * dist;
      snowBasePos[i3 + 1] = h;
      snowBasePos[i3 + 2] = Math.sin(angle) * dist;

      const chaosPhi = Math.random() * Math.PI * 2;
      const chaosR = 12 + Math.random() * 5;
      snowBaseChaos[i3] = Math.cos(chaosPhi) * chaosR;
      snowBaseChaos[i3 + 1] = -10 + Math.random() * 5;
      snowBaseChaos[i3 + 2] = Math.sin(chaosPhi) * chaosR;
    }

    return { 
      foliage: { pos: foliagePos, chaos: foliageChaos, colors: foliageColors },
      trunk: { pos: trunkPos, chaos: trunkChaos, colors: trunkColors },
      ribbon: { pos: ribbonPos, chaos: ribbonChaos },
      snowBase: { pos: snowBasePos, chaos: snowBaseChaos }
    };
  }, []);

  const ornaments = useMemo(() => {
    const list: OrnamentData[] = [];
    const count = 60;
    const types: OrnamentData['type'][] = ['sphere', 'box', 'heptagram', 'star'];
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      let weight = 0.5; 
      if (type === 'box') weight = 0.8;
      if (type === 'sphere') weight = 0.5;
      if (type === 'heptagram' || type === 'star') weight = 0.2;
      const hPct = 0.2 + Math.random() * 0.65; 
      const y = hPct * TREE_PARAMS.HEIGHT;
      const baseR = TREE_PARAMS.BASE_RADIUS * Math.pow(1 - hPct, 0.85);
      const angle = Math.random() * Math.PI * 2;
      const r = baseR * 0.92;
      list.push({
        id: `orn-${i}`,
        type,
        position: [Math.cos(angle) * r, y, Math.sin(angle) * r],
        color: i % 4 === 0 ? COLORS.GOLD : i % 3 === 0 ? COLORS.SILVER : COLORS.DEEP_RED,
        weight
      });
    }
    return list;
  }, []);

  useFrame((stateClock, delta) => {
    if (!pointsRef.current || !trunkRef.current || !ribbonPointsRef.current || !snowBaseRef.current) return;

    const target = state === TreeState.FORMED ? 1 : 0;
    const newTransition = THREE.MathUtils.lerp(transition, target, delta * 1.5);
    setTransition(newTransition);

    const time = stateClock.clock.elapsedTime;

    // Foliage update
    const foliagePos = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNTS.FOLIAGE; i++) {
      const i3 = i * 3;
      foliagePos[i3] = THREE.MathUtils.lerp(particles.foliage.chaos[i3], particles.foliage.pos[i3], newTransition);
      foliagePos[i3 + 1] = THREE.MathUtils.lerp(particles.foliage.chaos[i3 + 1], particles.foliage.pos[i3 + 1], newTransition);
      foliagePos[i3 + 2] = THREE.MathUtils.lerp(particles.foliage.chaos[i3 + 2], particles.foliage.pos[i3 + 2], newTransition);
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Trunk update
    const trunkPos = trunkRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNTS.TRUNK; i++) {
      const i3 = i * 3;
      trunkPos[i3] = THREE.MathUtils.lerp(particles.trunk.chaos[i3], particles.trunk.pos[i3], newTransition);
      trunkPos[i3 + 1] = THREE.MathUtils.lerp(particles.trunk.chaos[i3 + 1], particles.trunk.pos[i3 + 1], newTransition);
      trunkPos[i3 + 2] = THREE.MathUtils.lerp(particles.trunk.chaos[i3 + 2], particles.trunk.pos[i3 + 2], newTransition);
    }
    trunkRef.current.geometry.attributes.position.needsUpdate = true;

    // Ribbon update
    const ribbonPosArr = ribbonPointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNTS.RIBBON; i++) {
      const i3 = i * 3;
      ribbonPosArr[i3] = THREE.MathUtils.lerp(particles.ribbon.chaos[i3], particles.ribbon.pos[i3], newTransition);
      ribbonPosArr[i3 + 1] = THREE.MathUtils.lerp(particles.ribbon.chaos[i3 + 1], particles.ribbon.pos[i3 + 1], newTransition);
      ribbonPosArr[i3 + 2] = THREE.MathUtils.lerp(particles.ribbon.chaos[i3 + 2], particles.ribbon.pos[i3 + 2], newTransition);
      ribbonPosArr[i3] += Math.sin(time * 2.8 + i) * 0.035;
      ribbonPosArr[i3 + 1] += Math.cos(time * 2.8 + i) * 0.035;
    }
    ribbonPointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Snow Base update
    const snowPosArr = snowBaseRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNTS.SNOW_BASE; i++) {
      const i3 = i * 3;
      snowPosArr[i3] = THREE.MathUtils.lerp(particles.snowBase.chaos[i3], particles.snowBase.pos[i3], newTransition);
      snowPosArr[i3 + 1] = THREE.MathUtils.lerp(particles.snowBase.chaos[i3 + 1], particles.snowBase.pos[i3 + 1], newTransition);
      snowPosArr[i3 + 2] = THREE.MathUtils.lerp(particles.snowBase.chaos[i3 + 2], particles.snowBase.pos[i3 + 2], newTransition);
    }
    snowBaseRef.current.geometry.attributes.position.needsUpdate = true;

    // Ornaments sway
    if (ornamentsGroupRef.current) {
      ornamentsGroupRef.current.children.forEach((child, idx) => {
        const orn = child.userData as OrnamentData;
        if (orn && Array.isArray(orn.position)) {
          const swaySpeed = (1.6 - (orn.weight || 0.5)) * 1.5;
          const swayAmount = (1.2 - (orn.weight || 0.5)) * 0.16;
          child.position.x = orn.position[0] + Math.sin(time * swaySpeed + idx) * swayAmount;
          child.position.z = orn.position[2] + Math.cos(time * swaySpeed * 0.8 + idx) * swayAmount;
        }
      });
    }

    const rotSpeed = 0.06;
    pointsRef.current.rotation.y += delta * rotSpeed;
    trunkRef.current.rotation.y += delta * rotSpeed;
    ribbonPointsRef.current.rotation.y += delta * rotSpeed;
    snowBaseRef.current.rotation.y += delta * rotSpeed;
    if (ornamentsGroupRef.current) ornamentsGroupRef.current.rotation.y += delta * rotSpeed;
    
    // Explicit rotation for the top star
    if (starRef.current) {
      starRef.current.rotation.y += delta * 1.5;
    }
  });

  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <group>
      {/* Foliage - Super Dense Emerald Micro-particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.FOLIAGE} array={new Float32Array(PARTICLE_COUNTS.FOLIAGE * 3)} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNTS.FOLIAGE} array={particles.foliage.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.038} vertexColors transparent opacity={0.95} blending={THREE.AdditiveBlending} />
      </points>

      {/* Trunk - High Density Core */}
      <points ref={trunkRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.TRUNK} array={new Float32Array(PARTICLE_COUNTS.TRUNK * 3)} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNTS.TRUNK} array={particles.trunk.colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.055} vertexColors transparent opacity={0.9} />
      </points>

      {/* Ribbon Particles */}
      <points ref={ribbonPointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.RIBBON} array={new Float32Array(PARTICLE_COUNTS.RIBBON * 3)} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.12} color={COLORS.GOLD} transparent opacity={1.0} blending={THREE.AdditiveBlending} />
      </points>

      {/* Snowy Base - Irregular mound of white particles */}
      <points ref={snowBaseRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.SNOW_BASE} array={new Float32Array(PARTICLE_COUNTS.SNOW_BASE * 3)} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial size={0.045} color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </points>

      <group ref={ornamentsGroupRef} scale={[transition, transition, transition]} visible={transition > 0.1}>
        {ornaments.map((orn) => (
          <Ornament key={orn.id} data={orn} />
        ))}
        {photos.map((url, idx) => (
          <PhotoOrnament key={`photo-${idx}`} url={url} index={idx} />
        ))}
        
        {/* Top Feature - Rotating Light Pink Star */}
        <Float speed={5} rotationIntensity={0.5} floatIntensity={1.5}>
          <mesh ref={starRef} position={[0, TREE_PARAMS.HEIGHT + 0.6, 0]}>
            <StarTopGeometry />
            <meshPhysicalMaterial 
              color="#ffe8f1" 
              emissive="#ffe8f1" 
              emissiveIntensity={15} 
              metalness={0.8} 
              roughness={0.1}
              transmission={0.3} 
              thickness={1} 
            />
          </mesh>
        </Float>
      </group>

      <GoldDust transition={transition} />
      <Snowfall />
    </group>
  );
};

const GoldDust: React.FC<{ transition: number }> = ({ transition }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  
  const springData = useMemo(() => {
    const count = PARTICLE_COUNTS.GOLD_DUST;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 7;
      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = Math.random() * 18;
      positions[i3 + 2] = Math.sin(angle) * r;
    }
    return { positions, velocities };
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const posAttr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const { velocities } = springData;

    for (let i = 0; i < PARTICLE_COUNTS.GOLD_DUST; i++) {
      const i3 = i * 3;
      const spiralAngle = (time * 0.28) + (i * 0.07);
      const rTarget = 5 + Math.sin(time + i * 0.12) * 2.5;
      const tx = Math.cos(spiralAngle) * rTarget;
      const ty = (i / PARTICLE_COUNTS.GOLD_DUST) * 16;
      const tz = Math.sin(spiralAngle) * rTarget;

      const k = 0.048;
      const damping = 0.93;
      
      velocities[i3] = (velocities[i3] + (tx - posAttr[i3]) * k) * damping;
      velocities[i3 + 1] = (velocities[i3 + 1] + (ty - posAttr[i3 + 1]) * k) * damping;
      velocities[i3 + 2] = (velocities[i3 + 2] + (tz - posAttr[i3 + 2]) * k) * damping;

      posAttr[i3] += velocities[i3] * delta * 60;
      posAttr[i3 + 1] += velocities[i3 + 1] * delta * 60;
      posAttr[i3 + 2] += velocities[i3 + 2] * delta * 60;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.GOLD_DUST} array={springData.positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.065} color={COLORS.GOLD} transparent opacity={0.85} blending={THREE.AdditiveBlending} />
    </points>
  );
};

const Snowfall: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null!);
  
  const shader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') }
    },
    vertexShader: `
      uniform float uTime;
      attribute float aSize;
      attribute float aSpeed;
      attribute float aOffset;
      varying float vOpacity;
      void main() {
        vec3 pos = position;
        pos.y = mod(pos.y - uTime * aSpeed * 1.8, 30.0) - 10.0;
        pos.x += sin(uTime * 0.4 + aOffset) * 2.2;
        pos.z += cos(uTime * 0.3 + aOffset) * 2.2;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        
        float hAtten = smoothstep(-10.0, 15.0, pos.y);
        gl_PointSize = aSize * (380.0 / -mvPosition.z) * hAtten;
        vOpacity = hAtten * 0.88;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vOpacity;
      void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        if (dist > 0.5) discard;
        float strength = 1.0 - (dist * 2.0);
        gl_FragColor = vec4(uColor, strength * vOpacity);
      }
    `
  }), []);

  useFrame((state) => {
    if (pointsRef.current.material instanceof THREE.ShaderMaterial) {
      pointsRef.current.material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  const data = useMemo(() => {
    const count = PARTICLE_COUNTS.SNOW;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const speed = new Float32Array(count);
    const offset = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 35;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      size[i] = Math.random() * 2.5 + 0.8;
      speed[i] = 0.45 + Math.random();
      offset[i] = Math.random() * 100;
    }
    return { pos, size, speed, offset };
  }, []);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNTS.SNOW} array={data.pos} itemSize={3} />
        <bufferAttribute attach="attributes-aSize" count={PARTICLE_COUNTS.SNOW} array={data.size} itemSize={1} />
        <bufferAttribute attach="attributes-aSpeed" count={PARTICLE_COUNTS.SNOW} array={data.speed} itemSize={1} />
        <bufferAttribute attach="attributes-aOffset" count={PARTICLE_COUNTS.SNOW} array={data.offset} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial 
        args={[shader]} 
        transparent 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </points>
  );
};

const HeptagramGeometry = () => {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const points = 7;
    const outerRadius = 0.25;
    const innerRadius = 0.12;
    for (let i = 0; i <= points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i / points) * Math.PI;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    return s;
  }, []);
  return <extrudeGeometry args={[shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 }]} />;
};

const Ornament: React.FC<{ data: OrnamentData }> = ({ data }) => {
  return (
    <mesh position={data.position} userData={data}>
      {data.type === 'sphere' && <sphereGeometry args={[0.18, 32, 32]} />}
      {data.type === 'box' && <boxGeometry args={[0.26, 0.26, 0.26]} />}
      {data.type === 'heptagram' && <HeptagramGeometry />}
      {data.type === 'star' && <torusKnotGeometry args={[0.12, 0.04, 64, 8]} />}
      <meshPhysicalMaterial 
        color={data.color} 
        metalness={1.0} 
        roughness={0.03} 
        clearcoat={1} 
        emissive={data.color}
        emissiveIntensity={1.4}
        envMapIntensity={3.0}
      />
    </mesh>
  );
};

const PhotoOrnament: React.FC<{ url: string; index: number }> = ({ url, index }) => {
  const texture = useTexture(url);
  const data = useMemo<OrnamentData>(() => {
    const angle = (index * 1.5) + Math.PI;
    const h = 0.25 + (index * 0.12) % 0.55;
    const r = TREE_PARAMS.BASE_RADIUS * Math.pow(1 - h, 0.85) * 1.1;
    return {
      id: `photo-${index}`,
      type: 'photo',
      position: [Math.cos(angle) * r, h * TREE_PARAMS.HEIGHT, Math.sin(angle) * r],
      color: '#ffffff',
      weight: 1.0 
    };
  }, [index]);

  return (
    <group position={data.position} userData={data}>
       <mesh>
        <planeGeometry args={[1.2, 1.2]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent opacity={0.96} />
      </mesh>
      <mesh scale={[1.25, 1.25, 1]} position={[0, 0, -0.015]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshPhysicalMaterial 
          color={COLORS.GOLD} 
          metalness={1} 
          roughness={0} 
          emissive={COLORS.GOLD} 
          emissiveIntensity={1.8}
        />
      </mesh>
    </group>
  );
};

export default LuxuryTree;
