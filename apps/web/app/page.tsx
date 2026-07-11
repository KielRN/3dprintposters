import { LandingHero } from "@/components/LandingHero";
import { LandingSections } from "@/components/LandingSections";
import { LandingFooter } from "@/components/LandingFooter";

export default function Home() {
  return (
    <main className="bg-[var(--cream)] text-[var(--ink)]">
      <LandingHero />
      <LandingSections />
      <LandingFooter />
    </main>
  );
}

