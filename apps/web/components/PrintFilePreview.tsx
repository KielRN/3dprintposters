"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Box,
  CheckCircle2,
  Loader2,
  RotateCcw,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Vector3, type Group } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PrintFilePreviewProps = {
  proofUrl?: string;
  heightmapUrl?: string;
  previewUrl: string;
  modelStlPath?: string;
  printabilityStatus?: string;
  warnings?: string[];
};

type PrintFileStatusPanelProps = {
  status?: string;
  errorMessage?: string;
};

const INITIAL_CAMERA_POSITION = new Vector3(0, 0.08, 6.4);
const CAMERA_TARGET = new Vector3(0, 0, 0);
const BASE_CAMERA_DISTANCE = INITIAL_CAMERA_POSITION.distanceTo(CAMERA_TARGET);
const MIN_VIEWER_ZOOM = 0.7;
const MAX_VIEWER_ZOOM = 3;
const VIEWER_ZOOM_STEP = 0.25;

function clampViewerZoom(value: number) {
  return Math.min(MAX_VIEWER_ZOOM, Math.max(MIN_VIEWER_ZOOM, value));
}

function ReliefGlbModel({ previewUrl }: { previewUrl: string }) {
  const gltf = useLoader(GLTFLoader, previewUrl);
  const groupRef = useRef<Group>(null);

  return (
    <group ref={groupRef} rotation={[0.16, -0.18, 0]} scale={0.026}>
      <primitive object={gltf.scene} position={[-63.5, -88.9, -2.1]} />
    </group>
  );
}

function ReliefViewerCamera({
  zoom,
  resetSignal,
  onZoomChange,
}: {
  zoom: number;
  resetSignal: number;
  onZoomChange: (zoom: number) => void;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = BASE_CAMERA_DISTANCE / MAX_VIEWER_ZOOM;
    controls.maxDistance = BASE_CAMERA_DISTANCE / MIN_VIEWER_ZOOM;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.85;
    controls.target.copy(CAMERA_TARGET);
    controls.saveState();
    controlsRef.current = controls;

    const syncZoomFromCamera = () => {
      const distance = camera.position.distanceTo(controls.target);
      onZoomChange(clampViewerZoom(BASE_CAMERA_DISTANCE / distance));
    };
    controls.addEventListener("end", syncZoomFromCamera);

    return () => {
      controls.removeEventListener("end", syncZoomFromCamera);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl.domElement, onZoomChange]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const target = controls.target;
    const direction = camera.position.clone().sub(target).normalize();
    const distance = BASE_CAMERA_DISTANCE / clampViewerZoom(zoom);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.update();
  }, [camera, zoom]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    camera.position.copy(INITIAL_CAMERA_POSITION);
    controls.target.copy(CAMERA_TARGET);
    controls.update();
  }, [camera, resetSignal]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
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
  printabilityStatus,
  warnings = [],
}: PrintFilePreviewProps) {
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerResetSignal, setViewerResetSignal] = useState(0);

  const updateViewerZoom = useCallback((nextZoom: number) => {
    setViewerZoom((currentZoom) => {
      const clampedZoom = clampViewerZoom(nextZoom);
      return Math.abs(currentZoom - clampedZoom) < 0.01
        ? currentZoom
        : clampedZoom;
    });
  }, []);

  const zoomOut = () => {
    updateViewerZoom(viewerZoom - VIEWER_ZOOM_STEP);
  };

  const zoomIn = () => {
    updateViewerZoom(viewerZoom + VIEWER_ZOOM_STEP);
  };

  const resetViewer = () => {
    updateViewerZoom(1);
    setViewerResetSignal((signal) => signal + 1);
  };

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

      <div className="grid gap-px bg-black/10">
        <div className="grid gap-px bg-black/10 lg:grid-cols-2">
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
        </div>

        <div className="bg-white">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-black/10 px-4 text-sm">
            <strong>3D preview</strong>
            <span className="tabular-nums text-[var(--muted)]">
              {Math.round(viewerZoom * 100)}%
            </span>
          </div>
          <div className="relative h-[min(76vh,760px)] min-h-[520px] bg-[linear-gradient(145deg,#181c21,#303139)] sm:min-h-[620px]">
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
              <ReliefViewerCamera
                onZoomChange={updateViewerZoom}
                resetSignal={viewerResetSignal}
                zoom={viewerZoom}
              />
            </Canvas>
            <div className="absolute right-3 top-3 flex gap-2 rounded-lg border border-white/15 bg-black/45 p-1 shadow-xl backdrop-blur">
              <button
                aria-label="Zoom out"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-40"
                disabled={viewerZoom <= MIN_VIEWER_ZOOM + 0.01}
                onClick={zoomOut}
                title="Zoom out"
                type="button"
              >
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <button
                aria-label="Reset view"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70"
                onClick={resetViewer}
                title="Reset view"
                type="button"
              >
                <RotateCcw size={17} aria-hidden="true" />
              </button>
              <button
                aria-label="Zoom in"
                className="flex h-9 w-9 items-center justify-center rounded-md text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-40"
                disabled={viewerZoom >= MAX_VIEWER_ZOOM - 0.01}
                onClick={zoomIn}
                title="Zoom in"
                type="button"
              >
                <ZoomIn size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-black/10 p-4 text-sm sm:grid-cols-3">
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
    </section>
  );
}
