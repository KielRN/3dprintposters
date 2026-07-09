import Image from "next/image";
import manifest from "../../public/storyfront/manifest.json";

type ManifestEntry = { w: number; h: number; alt: string };
const shelfBackdrop = (manifest as Record<string, ManifestEntry>)[
  "epilogue/shelf.webp"
];

export type SceneId = "bookshelf" | "desk";

type ScenePreviewState = {
  status?: string;
  storagePath?: string;
};

type SceneStageProps = {
  heroName: string;
  activeScene: SceneId;
  onSceneChange: (scene: SceneId) => void;
  scene: ScenePreviewState | undefined;
  sceneUrl: string | null;
  conceptUrl: string | null;
};

const sceneChips: Array<{ id: SceneId; label: string }> = [
  { id: "bookshelf", label: "On the bookshelf" },
  { id: "desk", label: "On the desk" },
];

// Page-4 hero: the scene render is garnish. Pending shows the shelf backdrop
// with a shimmer; a failed or capped render falls back to the concept image
// composited over the backdrop with no alarm tones. Nothing here may ever
// gate checkout.
export function SceneStage({
  heroName,
  activeScene,
  onSceneChange,
  scene,
  sceneUrl,
  conceptUrl,
}: SceneStageProps) {
  const ready = scene?.status === "ready" && Boolean(sceneUrl);
  const failed =
    scene?.status === "failed" || (scene?.status === "ready" && !sceneUrl);

  return (
    <section>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--clay)] sm:aspect-[16/10]">
        {ready && sceneUrl ? (
          <img
            alt={`Artist's visualization of ${heroName} as a printed figurine ${
              activeScene === "bookshelf"
                ? "on a warm wooden bookshelf"
                : "on a cozy desk"
            }`}
            className="h-full w-full object-cover"
            src={sceneUrl}
          />
        ) : failed ? (
          <>
            {shelfBackdrop ? (
              <Image
                src="/storyfront/epilogue/shelf.webp"
                width={shelfBackdrop.w}
                height={shelfBackdrop.h}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover opacity-50 blur-[2px]"
              />
            ) : null}
            {conceptUrl ? (
              <div className="absolute inset-0 grid place-items-center p-6">
                <figure className="w-full max-w-[280px] rounded-xl border-[3px] border-[var(--ink)] bg-white p-2 shadow-[14px_22px_40px_rgba(26,23,20,0.28)]">
                  <img
                    alt={`Your hero's concept: ${heroName}`}
                    className="w-full rounded-lg object-contain"
                    src={conceptUrl}
                  />
                </figure>
              </div>
            ) : null}
          </>
        ) : (
          <div className="skeleton-shimmer absolute inset-0">
            {shelfBackdrop ? (
              <Image
                src="/storyfront/epilogue/shelf.webp"
                width={shelfBackdrop.w}
                height={shelfBackdrop.h}
                alt={shelfBackdrop.alt}
                className="h-full w-full object-cover opacity-40"
                priority
              />
            ) : null}
            <p className="display absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-xl text-[var(--ink)] sm:text-2xl">
              Placing {heroName} on the shelf…
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {sceneChips.map((chipOption) => {
          const active = chipOption.id === activeScene;
          return (
            <button
              className={
                active
                  ? "step-pill border-transparent bg-[var(--ember)] text-white"
                  : "step-pill transition-colors hover:text-[var(--ink)]"
              }
              type="button"
              aria-pressed={active}
              onClick={() => onSceneChange(chipOption.id)}
              key={chipOption.id}
            >
              {chipOption.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-[var(--muted)]">
        Artist&apos;s visualization — your printed hero is hand-finished by a
        3D artist.
      </p>
    </section>
  );
}
