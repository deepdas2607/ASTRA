"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";

function DustParticles({ count = 3000 }) {
  const points = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const temp = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      temp[i3] = (Math.random() - 0.5) * 50;
      temp[i3 + 1] = (Math.random() - 0.5) * 50;
      temp[i3 + 2] = (Math.random() - 0.5) * 50;
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    if (!points.current) return;
    const t = state.clock.getElapsedTime();
    points.current.rotation.y = t * 0.02;
    points.current.rotation.x = t * 0.01;
    
    // Subtle float
    points.current.position.y = Math.sin(t * 0.5) * 0.5;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[particles, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#ffffff"
        transparent
        opacity={0.4}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export default function MinimalBackground() {
  return (
    <div className="w-full h-full" style={{ position: 'absolute', top: 0, left: 0 }}>
      <Canvas camera={{ position: [0, 0, 20], fov: 75 }} gl={{ antialias: true }}>
        <DustParticles />
      </Canvas>
    </div>
  );
}
