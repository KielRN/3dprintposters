"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

type StoryBackButtonProps = {
  label: string;
  fallbackHref: string;
  className?: string;
};

export function StoryBackButton({
  label,
  fallbackHref,
  className = "story-nav-link",
}: StoryBackButtonProps) {
  const router = useRouter();

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }, [fallbackHref, router]);

  return (
    <button className={className} type="button" onClick={goBack}>
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
