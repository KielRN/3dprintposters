import { LandingFooter } from "@/components/LandingFooter";
import { LandingHero } from "@/components/LandingHero";
import { LandingSections } from "@/components/LandingSections";

export default function LandingPage() {
  return (
    <main className="bg-[var(--cream)] text-[var(--ink)]">
      <LandingHero />
      <LandingSections />
      <LandingFooter />
    </main>
  );
}
