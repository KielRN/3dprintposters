"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { Camera } from "lucide-react";
import { SizeScale } from "@/components/SizeScale";

const ModelViewer = "model-viewer" as any;

function Reveal({
  children,
  className = "",
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

const steps = [
  {
    n: "1",
    title: "Upload their photo",
    body: "Start with a single picture. A loved one, a hero, a memory you want to hold."
  },
  {
    n: "2",
    title: "Approve your hero",
    body: "We generate a custom 3D concept. You review every detail before it becomes real."
  },
  {
    n: "3",
    title: "Claim your keepsake",
    body: "Hand-painted by our studio artist, inspected, and shipped directly to your shelf."
  }
];

const gallery = [
  { img: "/landing/cards/super_hero_male_skyline.png", label: "Super Hero Figure - Male", desc: "A confident caped hero with a starburst emblem." },
  { img: "/landing/cards/super_hero_female_rooftop.png", label: "Super Hero Figure - Female", desc: "An arms-crossed hero in deep navy, standing her ground." },
  { img: "/landing/cards/chibi_fantasy_male_ruins.png", label: "Chibi heroic fantasy male", desc: "A noble fantasy hero, sword at rest, ready for the shelf." },
  { img: "/landing/cards/chibi_fantasy_female_forest.png", label: "Chibi heroic fantasy female", desc: "The heroine of the story, sculpted with your favorite person's smile." },
  { img: "/landing/cards/chibi_photo_male_livingroom.png", label: "Chibi male", desc: "A friendly chibi likeness straight from his photo." },
  { img: "/landing/cards/chibi_photo_female_cafe.png", label: "Chibi female", desc: "A friendly chibi likeness straight from her photo." },
  { img: "/landing/cards/heroic_fantasy_male_mountain.png", label: "Heroic fantasy male", desc: "A grounded warrior sculpt with real stature." },
  { img: "/landing/cards/heroic_fantasy_female_castle.png", label: "Heroic fantasy female", desc: "A noble warrior sculpt with real presence." }
];

export function LandingSections() {
  return (
    <div className="bg-[var(--cream)] text-[var(--ink)]">
      <Script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js" />
      
      {/* How it works */}
      <section className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10">
        <Reveal>
          <h2 className="display max-w-[20ch] text-[clamp(2rem,5vw,3.5rem)] leading-[1.12]">
            Three steps to a shelf-worthy keepsake.
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
          {steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 90}>
              <div className="border-t border-[var(--line)] pt-6">
                <span className="display block text-5xl text-[var(--ember)]">
                  {step.n}
                </span>
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 max-w-[34ch] leading-relaxed text-[var(--muted)]">
                  {step.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Gallery strip — drifts horizontally with scroll where supported */}
      <section className="overflow-hidden py-10">
        <Reveal className="mx-auto max-w-7xl px-5 sm:px-7 lg:px-10">
          <h2 className="display text-[clamp(1.75rem,4vw,2.75rem)] leading-tight">
            Monthly drops. Limited editions.
          </h2>
          <p className="mt-4 max-w-[50ch] text-lg leading-relaxed text-[var(--muted)]">
            We drop a handful of unique styles every month. Once a style is gone, it doesn't come back. Every hero is personalized with their nameplate so no two are ever exactly alike.
          </p>
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-7xl grid-cols-2 gap-x-5 gap-y-10 px-5 sm:px-7 md:grid-cols-4 lg:px-10">
          {gallery.map((tile) => (
            <figure
              key={tile.label}
              className="w-full"
            >
              <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-[var(--clay)] bg-[var(--cream)] shadow-sm">
                <img src={tile.img} alt={tile.label} className="h-full w-full object-cover object-center" loading="lazy" />
              </div>
              <figcaption className="mt-4 flex flex-col gap-1">
                <span className="text-base font-bold text-[var(--ink)]">{tile.label}</span>
                <span className="text-sm leading-snug text-[var(--muted)]">{tile.desc}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Why 3DPrintYou */}
      <section className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal>
            <h2 className="display text-[clamp(2rem,5vw,3.5rem)] leading-[1.12]">
              Real weight. Real presence.
            </h2>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[var(--ink)]/80">
              A framed photo flattens a person behind glass. A physical hero has weight—something you can hold, hand to a grandparent, or set proudly on a desk.
            </p>
            <p className="mt-4 max-w-[46ch] leading-relaxed text-[var(--muted)]">
              Every hero is modeled with care, reviewed by our human print team, and finished to feel like a true collectible. No studio visits, no special equipment—just a photo you love, brought to life.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div
              className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[var(--clay)] bg-gradient-to-br from-[var(--clay)] to-[#dccfbd]"
            >
              <ModelViewer
                src="/models/guest-260a1.glb"
                auto-rotate="true"
                camera-controls="true"
                camera-orbit="0deg 80deg auto"
                camera-target="0m 0.1m 0m"
                shadow-intensity="1"
                environment-image="legacy"
                style={{ width: "100%", height: "100%" }}
                alt="A finished 3D printed hero"
              ></ModelViewer>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Scale & Gift Section */}
      <section className="mx-auto max-w-7xl px-5 py-28 sm:px-7 lg:px-10">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <Reveal className="order-2 md:order-1">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] shadow-sm">
              <img
                src="/landing/panel-gift-hands.webp"
                alt="Two hands presenting a gift box with a 3D printed hero inside"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </Reveal>
          <Reveal delay={120} className="order-1 md:order-2">
            <h2 className="display text-[clamp(2rem,5vw,3.5rem)] leading-[1.12]">
              The perfect unboxing.
            </h2>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[var(--ink)]/80">
              Standing roughly 150 millimeters tall, these heroes are designed to feel substantial in your hands and look perfect on a desk or shelf.
            </p>
            <div className="mt-10 max-w-[260px]">
              <SizeScale />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final CTA band */}
      <section className="bg-[var(--ember)]">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-5 py-24 sm:px-7 md:flex-row md:items-center md:justify-between lg:px-10">
          <h2 className="display max-w-[12ch] text-[clamp(2.5rem,7vw,5rem)] leading-[0.95] text-[var(--cream)]">
            Bring them home.
          </h2>
          <Link
            href="/start"
            className="inline-flex min-h-[56px] items-center justify-center rounded-lg bg-[var(--cream)] px-9 text-lg font-extrabold text-[var(--ink)] transition-transform hover:-translate-y-0.5"
          >
            Start
          </Link>
        </div>
      </section>
    </div>
  );
}

