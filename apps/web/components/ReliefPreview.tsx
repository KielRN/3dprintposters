"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Box, Maximize2 } from "lucide-react";
import { useRef } from "react";
import type { Mesh } from "three";

function PosterReliefMesh() {
  const meshRef = useRef<Mesh>(null);
  const { size } = useThree();
  const meshScale = size.width < 520 ? 0.54 : 1;

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.08;
      meshRef.current.rotation.y = Math.sin(Date.now() * 0.00035) * 0.18;
    }
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-0.78, 0, 0.08]}
      position={[0, 0, 0]}
      scale={meshScale}
    >
      <boxGeometry args={[2.25, 3.05, 0.14, 32, 32, 1]} />
      <meshStandardMaterial color="#f2f4f1" roughness={0.82} metalness={0.02} />
    </mesh>
  );
}

export function ReliefPreview() {
  return (
    <section className="panel grid min-h-[520px] min-w-0 overflow-hidden rounded-lg lg:min-h-0">
      <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
        <div>
          <p className="text-sm font-bold text-[var(--coral)]">Relief preview</p>
          <h2 className="mt-1 text-xl font-semibold">Printable surface</h2>
        </div>
        <button className="secondary-button h-11 min-h-0 w-11 px-0" type="button">
          <Maximize2 size={18} aria-hidden="true" />
          <span className="sr-only">Open large preview</span>
        </button>
      </div>

      <div className="relative min-h-[440px] bg-[radial-gradient(circle_at_50%_10%,rgba(20,125,126,0.16),transparent_38%),linear-gradient(145deg,#191c22,#2f3138)]">
        <Canvas camera={{ position: [0, 0.2, 5.8], fov: 42 }}>
          <ambientLight intensity={0.85} />
          <directionalLight position={[4, 5, 4]} intensity={1.35} />
          <pointLight position={[-4, -3, 3]} intensity={0.45} color="#df5c45" />
          <PosterReliefMesh />
        </Canvas>

        <div className="absolute bottom-4 left-4 right-4 grid gap-3 rounded-lg border border-white/12 bg-white/[0.92] p-4 text-sm shadow-2xl backdrop-blur sm:grid-cols-3">
          <div>
            <p className="text-[var(--muted)]">Material</p>
            <strong>White resin</strong>
          </div>
          <div>
            <p className="text-[var(--muted)]">Model</p>
            <strong>STL pending</strong>
          </div>
          <div className="flex items-center gap-2">
            <Box size={18} aria-hidden="true" />
            <strong>127mm x 178mm</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

