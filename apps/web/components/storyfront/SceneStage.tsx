import Image from "next/image";
import manifest from "../../public/storyfront/manifest.json";

type ManifestEntry = { w: number; h: number; alt: string };
const shelfBackdrop = (manifest as Record<string, ManifestEntry>)[
  "epilogue/shelf.webp"
];

export type SceneId = "bookshelf" | "desk" | "unboxing";
export const SCENE_IDS: SceneId[] = ["bookshelf", "desk", "unboxing"];

type ScenePreviewState = {
  status?: string;
  storagePath?: string;
};

// Shared with OfferBlock, where the unboxing render now lives.
export function unboxingSceneAlt(name: string): string {
  return `Artist's visualization of ${name} as a printed figurine standing in its open unboxing box`;
}

const sceneCopy: Record<
  SceneId,
  { pending: (name: string) => string; alt: (name: string) => string }
> = {
  bookshelf: {
    pending: (name) => `Placing ${name} on the shelf...`,
    alt: (name) =>
      `Artist's visualization of ${name} as a printed figurine on a warm wooden bookshelf`,
  },
  desk: {
    pending: (name) => `Setting ${name} on the desk...`,
    alt: (name) =>
      `Artist's visualization of ${name} as a printed figurine on a cozy desk`,
  },
  unboxing: {
    pending: (name) => `Wrapping ${name} up...`,
    alt: unboxingSceneAlt,
  },
};

type SceneCellProps = {
  sceneId: SceneId;
  heroName: string;
  scene: ScenePreviewState | undefined;
  sceneUrl: string | null;
  conceptUrl: string | null;
};

// One scene render. Pending shows the shelf backdrop with a shimmer; a failed
// or capped render falls back to the concept image composited over the
// backdrop with no alarm tones. Nothing here may ever gate checkout.
function SceneCell({
  sceneId,
  heroName,
  scene,
  sceneUrl,
  conceptUrl,
}: SceneCellProps) {
  const ready = scene?.status === "ready" && Boolean(sceneUrl);
  const failed =
    scene?.status === "failed" || (scene?.status === "ready" && !sceneUrl);

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--clay)] shadow-[10px_16px_36px_rgba(26,23,20,0.12)]">
      {ready && sceneUrl ? (
        <img
          alt={sceneCopy[sceneId].alt(heroName)}
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
              <figure className="w-full max-w-[240px] rounded-xl border-[3px] border-[var(--ink)] bg-white p-2 shadow-[14px_22px_40px_rgba(26,23,20,0.28)]">
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
              priority={sceneId === "bookshelf"}
            />
          ) : null}
          <p className="display absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-lg text-[var(--ink)] sm:text-xl">
            {sceneCopy[sceneId].pending(heroName)}
          </p>
        </div>
      )}
    </div>
  );
}

type SceneStageProps = {
  heroName: string;
  scenes: Partial<Record<SceneId, ScenePreviewState | undefined>>;
  sceneUrls: Partial<Record<SceneId, string | null>>;
  conceptUrl: string | null;
};

// Page-4 hero: the bookshelf + desk pair, side by side. The unboxing render
// belongs to the claim card (OfferBlock) — the customer's hero in the box sits
// beside the checkout button, not up here. New jobs normally have these ready
// because the backend trigger starts them as soon as the concept is definitive.
export function SceneStage({
  heroName,
  scenes,
  sceneUrls,
  conceptUrl,
}: SceneStageProps) {
  return (
    <section className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SceneCell
          sceneId="bookshelf"
          heroName={heroName}
          scene={scenes.bookshelf}
          sceneUrl={sceneUrls.bookshelf ?? null}
          conceptUrl={conceptUrl}
        />
        <SceneCell
          sceneId="desk"
          heroName={heroName}
          scene={scenes.desk}
          sceneUrl={sceneUrls.desk ?? null}
          conceptUrl={conceptUrl}
        />
      </div>
      <p className="text-sm text-[var(--muted)]">
        Artist&apos;s visualization - your printed hero is hand-finished by a
        3D artist.
      </p>
    </section>
  );
}
