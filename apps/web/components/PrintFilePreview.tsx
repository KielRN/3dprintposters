"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  Box,
  CheckCircle2,
  Download,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Suspense, useRef } from "react";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PrintFilePreviewProps = {
  proofUrl?: string;
  heightmapUrl?: string;
  previewUrl: string;
  modelStlPath?: string;
  artifactDownloads?: ArtifactDownload[];
  printabilityStatus?: string;
  warnings?: string[];
};

type PrintFileStatusPanelProps = {
  status?: string;
  errorMessage?: string;
};

export type ArtifactDownload = {
  label: string;
  filename: string;
  url: string;
  icon: "model" | "preview" | "heightmap" | "metadata" | "texture" | "guide";
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

function ArtifactIcon({ icon }: { icon: ArtifactDownload["icon"] }) {
  if (icon === "heightmap") {
    return <ImageIcon size={17} aria-hidden="true" />;
  }

  if (icon === "metadata") {
    return <FileJson size={17} aria-hidden="true" />;
  }

  if (icon === "texture") {
    return <ImageIcon size={17} aria-hidden="true" />;
  }

  if (icon === "guide") {
    return <FileText size={17} aria-hidden="true" />;
  }

  if (icon === "model") {
    return <Box size={17} aria-hidden="true" />;
  }

  return <Download size={17} aria-hidden="true" />;
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
  proofUrl,
  heightmapUrl,
  previewUrl,
  modelStlPath,
  artifactDownloads = [],
  printabilityStatus,
  warnings = [],
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

      <div className="grid gap-px bg-black/10 lg:grid-cols-3">
        <div className="bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-black/10 px-4 text-sm">
            <strong>Approved proof</strong>
            <span className="text-[var(--muted)]">source</span>
          </div>
          <div className="aspect-[5/7] bg-black/[0.035]">
            {proofUrl ? (
              <img
                alt="Approved generated poster proof"
                className="h-full w-full object-cover"
                src={proofUrl}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-[var(--muted)]">
                Proof image unavailable
              </div>
            )}
          </div>
        </div>

        <div className="bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-black/10 px-4 text-sm">
            <strong>Heightmap</strong>
            <span className="text-[var(--muted)]">high/low</span>
          </div>
          <div className="aspect-[5/7] bg-black/[0.035]">
            {heightmapUrl ? (
              <img
                alt="Generated relief heightmap"
                className="h-full w-full object-cover"
                src={heightmapUrl}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-[var(--muted)]">
                Heightmap pending
              </div>
            )}
          </div>
        </div>

        <div className="bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-black/10 px-4 text-sm">
            <strong>3D preview</strong>
            <span className="text-[var(--muted)]">GLB</span>
          </div>
          <div className="relative aspect-[5/7] bg-[linear-gradient(145deg,#181c21,#303139)]">
            <Canvas camera={{ position: [0, 0.08, 6.4], fov: 42 }}>
              <ambientLight intensity={0.88} />
              <directionalLight position={[4, 5, 6]} intensity={1.45} />
              <pointLight
                position={[-3, -3, 4]}
                intensity={0.38}
                color="#df5c45"
              />
              <Suspense fallback={null}>
                <ReliefGlbModel previewUrl={previewUrl} />
              </Suspense>
            </Canvas>
          </div>
        </div>
      </div>

      <div className="grid gap-5 border-t border-black/10 p-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="flex items-center gap-2 sm:col-span-3">
            <Box size={18} aria-hidden="true" />
            <strong>127mm x 178mm</strong>
          </div>
          {warnings.length > 0 ? (
            <div className="grid gap-2 sm:col-span-3">
              {warnings.map((warning) => (
                <p
                  className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 font-semibold text-[var(--ink)]"
                  key={warning}
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid content-start gap-2">
          <p className="font-bold text-[var(--muted)]">Downloads</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {artifactDownloads.map((artifact) => (
              <a
                className="secondary-button min-h-10 justify-start px-3 text-sm"
                download={artifact.filename}
                href={artifact.url}
                key={artifact.filename}
                rel="noreferrer"
                target="_blank"
              >
                <ArtifactIcon icon={artifact.icon} />
                {artifact.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
