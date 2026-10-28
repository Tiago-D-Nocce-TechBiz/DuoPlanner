import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PlaneTakeoff, Sparkles } from "lucide-react";

/** Secção principal (hero) da Landing Page. */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Brilho subtil de fundo com a cor de destaque */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-96 w-96 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
      />
      <Container className="relative py-24 text-center md:py-32">
        <span className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-400">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Planeamento pessoal, gratuito e sem anúncios
        </span>
        <h1 className="mx-auto max-w-3xl font-serif text-4xl font-bold leading-tight text-zinc-50 md:text-6xl">
          Planeie viagens a dois,{" "}
          <span className="text-accent">sem complicações</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          Pesquise voos e estadias nos melhores sites, organize o roteiro e
          controle as finanças da dupla — tudo num só lugar. O PlannerDuo
          encontra as opções e leva-o direto às páginas certas.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/registo" size="lg" variant="primary">
            <PlaneTakeoff className="h-5 w-5" />
            Começar a planear
          </Button>
          <Button href="#como-funciona" size="lg" variant="secondary">
            Ver como funciona
          </Button>
        </div>
      </Container>
    </section>
  );
}
