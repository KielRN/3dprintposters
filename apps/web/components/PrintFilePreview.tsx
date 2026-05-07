"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Box, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PrintFilePreviewProps = {
  previewUrl: string;
  modelStlPath?: string;
  printabilityStatus?: string;
  warningCount?: number;
};

type PrintFileStatusPanelProps = {
  status?: string;
  errorMessage?: string;
};

function ReliefGlbModel({ previewUrl }: { previewUrl: string }) {
  const gltf = useLoader(GLTFLoader, previewUrl);
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = -0.18 + Math.sin(Date.now() * 0.0005) * 0.04;
      groupRef.current.rotation.x = 0.16 + Math.sin(Date.now() * 0.0004) * 0.02;
    }
  });

  return (
    <group ref={groupRef} rotation={[0.16, -0.18, 0]} scale={0.026}>
      <primitive object={gltf.scene} position={[-63.5, -88.9, -2.1]} />
    </group>
  );
}

export function PrintFileStatusPanel({
  status,
  errorMessage,
}: PrintFileStatusPanelProps) {
  if (status === "generating") {
    return (
      <section className="mt-8 rounded-lg border border-black/10 bg-white p-5">
        <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]">
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          Generating 3D relief preview
        </div>
      </section>
    );
  }

  if (status === "failed") {
    return (
      <section className="mt-8 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 p-5">
        <div className="flex items-start gap-3 text-sm font-semibold text-[var(--coral)]">
          <TriangleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{errorMessage || "3D relief preview generation failed."}</span>
        </div>
      </section>
    );
  }

  return null;
}

export function PrintFilePreview({
  previewUrl,
  modelStlPath,
  printabilityStatus,
  warningCount = 0,
}: PrintFilePreviewProps) {
  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-black/10 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <p className="text-sm font-bold text-[var(--teal)]">3D relief preview</p>
          <h2 className="mt-1 text-xl font-semibold">Printable surface</h2>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--teal)] px-3 text-sm font-bold text-white">
          <CheckCircle2 size={15} aria-hidden="true" />
          Ready
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative min-h-[460px] bg-[linear-gradient(145deg,#181c21,#303139)]">
          <Canvas camera={{ position: [0, 0.08, 6.4], fov: 42 }}>
            <ambientLight intensity={0.88} />
            <directionalLight position={[4, 5, 6]} intensity={1.45} />
            <pointLight position={[-3, -3, 4]} intensity={0.38} color="#df5c45" />
            <Suspense fallback={null}>
              <ReliefGlbModel previewUrl={previewUrl} />
            </Suspense>
          </Canvas>
        </div>

        <div className="grid content-start gap-4 border-t border-black/10 p-4 text-sm lg:border-l lg:border-t-0">
          <div>
            <p className="text-[var(--muted)]">Artifact</p>
            <strong>preview.glb</strong>
          </div>
          <div>
            <p className="text-[var(--muted)]">Print file</p>
            <strong>{modelStlPath ? "model.stl" : "Pending"}</strong>
          </div>
          <div>
            <p className="text-[var(--muted)]">Printability</p>
            <strong>{printabilityStatus?.replaceAll("_", " ") ?? "Checked"}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Box size={18} aria-hidden="true" />
            <strong>127mm x 178mm</strong>
          </div>
          {warningCount > 0 ? (
            <p className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 font-semibold text-[var(--ink)]">
              {warningCount} package warning{warningCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
