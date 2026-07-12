import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { WorkflowStyleConfig } from "@/lib/figurineWorkflowConfig";
import { styleCardContent } from "./styleCardContent";

type AuthIntent = "sign-in" | "create";

// MakerLab-style gallery card. The label always comes from the live workflow
// config; only art and description are keyed by style id.
export function StyleCard({
  style,
  authIntent,
}: {
  style: WorkflowStyleConfig;
  authIntent?: AuthIntent;
}) {
  const content = styleCardContent(style.id);
  const href = authIntent
    ? `/start/${style.id}?auth=${authIntent}`
    : `/start/${style.id}`;

  return (
    <Link
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] focus-visible:ring-offset-2"
      href={href}
    >
      <article className="panel overflow-hidden rounded-xl transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1">
        <div className="relative aspect-[2/1] overflow-hidden bg-[var(--clay)]">
          {content.art ? (
            <Image
              src={content.art.src}
              width={content.art.width}
              height={content.art.height}
              alt={content.art.alt}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="h-full w-full object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--clay)] to-[#dccfbd]"
              role="img"
              aria-label={`${style.label} figurine style`}
            >
              <Sparkles
                className="text-[var(--muted)] opacity-40"
                size={36}
                aria-hidden="true"
              />
            </div>
          )}
          {content.chip ? (
            <span className="absolute left-3 top-3 rounded-full bg-[var(--ember)] px-2.5 py-1 text-xs font-bold text-white">
              {content.chip}
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-3 p-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-snug">{style.label}</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {content.description}
            </p>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ink)]/15 text-[var(--ink)] transition-colors duration-300 group-hover:border-transparent group-hover:bg-[var(--ember)] group-hover:text-white"
            aria-hidden="true"
          >
            <ArrowRight size={16} />
          </span>
        </div>
      </article>
    </Link>
  );
}

