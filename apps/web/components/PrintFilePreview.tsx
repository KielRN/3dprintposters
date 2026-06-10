"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Loader2,
  Palette,
  RotateCcw,
  Tag,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Box3, Vector3, type Group } from "three";
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

type FigurineModelPreviewProps = {
  previewUrl: string;
  status?: string;
  printReadiness?: string;
  warnings?: string[];
};

type PrintFileStatusPanelProps = {
  status?: string;
  errorMessage?: string;
};

type FigurineBaseSignPanelProps = {
  signEnabled: boolean;
  signText: string;
  namedBaseStatus?: string;
  normalizedName?: string;
  warnings?: string[];
  basePreviewUrl?: string;
  busy: boolean;
  error?: string;
  notice?: string;
  onSave: (input: { signEnabled: boolean; signText: string }) => void;
};

const SIGN_NAME_MAX_CHARACTERS = 12;
const SIGN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .'-]*$/;

const CAMERA_TARGET = new Vector3(0, 0, 0);
const RELIEF_CAMERA_POSITION = new Vector3(0, 0.08, 6.4);
const FIGURINE_CAMERA_POSITION = new Vector3(0, 0.2, 4.2);
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

function AutoFramedGlbModel({ previewUrl }: { previewUrl: string }) {
  const gltf = useLoader(GLTFLoader, previewUrl);
  const groupRef = useRef<Group>(null);
  const frame = useMemo(() => {
    const box = new Box3().setFromObject(gltf.scene);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.85 / maxDimension;

    return {
      position: [
        -center.x * scale,
        -center.y * scale,
        -center.z * scale,
      ] as [number, number, number],
      scale,
    };
  }, [gltf.scene]);

  return (
    <group ref={groupRef} position={frame.position} scale={frame.scale}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function ReliefViewerCamera({
  zoom,
  resetSignal,
  onZoomChange,
  initialCameraPosition,
}: {
  zoom: number;
  resetSignal: number;
  onZoomChange: (zoom: number) => void;
  initialCameraPosition: Vector3;
}) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const baseCameraDistance = initialCameraPosition.distanceTo(CAMERA_TARGET);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = baseCameraDistance / MAX_VIEWER_ZOOM;
    controls.maxDistance = baseCameraDistance / MIN_VIEWER_ZOOM;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.85;
    controls.target.copy(CAMERA_TARGET);
    controls.saveState();
    controlsRef.current = controls;

    const syncZoomFromCamera = () => {
      const distance = camera.position.distanceTo(controls.target);
      onZoomChange(clampViewerZoom(baseCameraDistance / distance));
    };
    controls.addEventListener("end", syncZoomFromCamera);

    return () => {
      controls.removeEventListener("end", syncZoomFromCamera);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [baseCameraDistance, camera, gl.domElement, onZoomChange]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const target = controls.target;
    const direction = camera.position.clone().sub(target).normalize();
    const distance = baseCameraDistance / clampViewerZoom(zoom);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.update();
  }, [baseCameraDistance, camera, zoom]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    camera.position.copy(initialCameraPosition);
    controls.target.copy(CAMERA_TARGET);
    controls.update();
  }, [camera, initialCameraPosition, resetSignal]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  return null;
}

function GlbViewer({
  previewUrl,
  variant,
  compact = false,
}: {
  previewUrl: string;
  variant: "relief" | "auto";
  compact?: boolean;
}) {
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerResetSignal, setViewerResetSignal] = useState(0);
  const cameraPosition =
    variant === "relief" ? RELIEF_CAMERA_POSITION : FIGURINE_CAMERA_POSITION;

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
    <div
      className={
        compact
          ? "relative h-[min(48vh,420px)] min-h-[320px] bg-[linear-gradient(145deg,#181c21,#303139)]"
          : "relative h-[min(76vh,760px)] min-h-[520px] bg-[linear-gradient(145deg,#181c21,#303139)] sm:min-h-[620px]"
      }
    >
      <Canvas
        camera={{
          position: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
          fov: variant === "relief" ? 42 : 38,
        }}
      >
        <ambientLight intensity={variant === "relief" ? 0.88 : 1.15} />
        <directionalLight position={[4, 5, 6]} intensity={1.45} />
        <pointLight
          position={[-3, -3, 4]}
          intensity={0.38}
          color="#df5c45"
        />
        <Suspense fallback={null}>
          {variant === "relief" ? (
            <ReliefGlbModel previewUrl={previewUrl} />
          ) : (
            <AutoFramedGlbModel previewUrl={previewUrl} />
          )}
        </Suspense>
        <ReliefViewerCamera
          initialCameraPosition={cameraPosition}
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
      <span className="absolute left-3 top-3 rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-sm font-bold tabular-nums text-white shadow-xl backdrop-blur">
        {Math.round(viewerZoom * 100)}%
      </span>
    </div>
  );
}

function labelizeStatus(value: string | undefined, fallback: string) {
  return value ? value.replaceAll("_", " ") : fallback;
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

export function FigurineModelPreview({
  previewUrl,
  status,
  printReadiness,
  warnings = [],
}: FigurineModelPreviewProps) {
  const visibleWarnings =
    warnings.length > 0
      ? warnings
      : ["This 3D preview shows the generated color model. Print files are not ready yet."];

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-black/10 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <p className="text-sm font-bold text-[var(--teal)]">
            Color figurine preview
          </p>
          <h2 className="mt-1 text-xl font-semibold">Generated model</h2>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--gold)] px-3 text-sm font-bold text-[var(--ink)]">
          <Palette size={15} aria-hidden="true" />
          Preview only
        </span>
      </div>

      <GlbViewer previewUrl={previewUrl} variant="auto" />

      <div className="grid gap-3 border-t border-black/10 p-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-[var(--muted)]">Artifact</p>
          <strong>Creative Lab GLB</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Preview</p>
          <strong>{labelizeStatus(status, "Color preview ready")}</strong>
        </div>
        <div>
          <p className="text-[var(--muted)]">Print readiness</p>
          <strong>{labelizeStatus(printReadiness, "Needs review")}</strong>
        </div>
        <div className="grid gap-2 sm:col-span-3">
          {visibleWarnings.map((warning) => (
            <p
              className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 px-3 py-2 font-semibold text-[var(--ink)]"
              key={warning}
            >
              {warning}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FigurineBaseSignPanel({
  signEnabled,
  signText,
  namedBaseStatus,
  normalizedName,
  warnings = [],
  basePreviewUrl,
  busy,
  error,
  notice,
  onSave,
}: FigurineBaseSignPanelProps) {
  const [enabled, setEnabled] = useState(signEnabled);
  const [text, setText] = useState(signText);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setEnabled(signEnabled);
  }, [signEnabled]);

  useEffect(() => {
    setText(signText);
  }, [signText]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!enabled) {
      setValidationError("");
      onSave({ signEnabled: false, signText: "" });
      return;
    }

    const collapsed = text.trim().replace(/\s+/g, " ");
    if (!collapsed) {
      setValidationError("Enter a name for the base sign.");
      return;
    }
    if (collapsed.length > SIGN_NAME_MAX_CHARACTERS) {
      setValidationError(
        `Sign name must be ${SIGN_NAME_MAX_CHARACTERS} characters or fewer.`,
      );
      return;
    }
    if (!SIGN_NAME_PATTERN.test(collapsed)) {
      setValidationError(
        "Use letters, numbers, spaces, hyphens, apostrophes, and periods, starting with a letter or number.",
      );
      return;
    }

    setValidationError("");
    onSave({ signEnabled: true, signText: collapsed });
  }

  const visibleError = validationError || error || "";

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-black/10 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 p-4">
        <div>
          <p className="text-sm font-bold text-[var(--teal)]">Base name sign</p>
          <h2 className="mt-1 text-xl font-semibold">Personalize the base</h2>
        </div>
        <span className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--gold)] px-3 text-sm font-bold text-[var(--ink)]">
          <Tag size={15} aria-hidden="true" />
          Square base
        </span>
      </div>

      <form className="grid gap-4 p-4" onSubmit={handleSubmit}>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            checked={enabled}
            className="h-4 w-4 accent-[var(--teal)]"
            disabled={busy}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          Add a name to the front of the base
        </label>

        {enabled ? (
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-[var(--muted)]"
              htmlFor="base-sign-name"
            >
              Name on the base
            </label>
            <input
              className="min-h-11 rounded-lg border border-black/15 px-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--teal)]/60"
              disabled={busy}
              id="base-sign-name"
              maxLength={SIGN_NAME_MAX_CHARACTERS}
              onChange={(event) => setText(event.target.value)}
              placeholder="Elliott"
              type="text"
              value={text}
            />
            <p className="text-sm text-[var(--muted)]">
              Up to {SIGN_NAME_MAX_CHARACTERS} characters: letters, numbers,
              spaces, hyphens, apostrophes, and periods.
            </p>
          </div>
        ) : null}

        {visibleError ? (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
            <AlertCircle
              className="mt-0.5 shrink-0"
              size={16}
              aria-hidden="true"
            />
            {visibleError}
          </p>
        ) : null}

        {notice && !visibleError ? (
          <p className="flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
            <CheckCircle2
              className="mt-0.5 shrink-0"
              size={16}
              aria-hidden="true"
            />
            {notice}
          </p>
        ) : null}

        <button className="primary-button" disabled={busy} type="submit">
          {busy ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : (
            <Tag size={18} aria-hidden="true" />
          )}
          {busy
            ? "Generating base sign"
            : enabled
              ? "Save name and generate base"
              : "Save base without a name"}
        </button>
      </form>

      {namedBaseStatus ? (
        <div className="grid gap-3 border-t border-black/10 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[var(--muted)]">Base sign</p>
            <strong>{labelizeStatus(namedBaseStatus, "Pending")}</strong>
          </div>
          <div>
            <p className="text-[var(--muted)]">Name on base</p>
            <strong>{normalizedName ?? "None"}</strong>
          </div>
          <div>
            <p className="text-[var(--muted)]">Artifact</p>
            <strong>named-base.stl</strong>
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
      ) : null}

      {basePreviewUrl ? (
        <div className="border-t border-black/10">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-black/10 px-4 text-sm">
            <strong>Named base preview</strong>
            <span className="text-[var(--muted)]">orbit</span>
          </div>
          <GlbViewer compact previewUrl={basePreviewUrl} variant="auto" />
        </div>
      ) : null}
    </section>
  );
}

export function PrintFilePreview({
  proofUrl,
  heightmapUrl,
  previewUrl,
  modelStlPath,
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
            <span className="text-[var(--muted)]">orbit</span>
          </div>
          <GlbViewer previewUrl={previewUrl} variant="relief" />
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
