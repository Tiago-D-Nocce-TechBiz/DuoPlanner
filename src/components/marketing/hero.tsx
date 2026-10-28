import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { PlaneTakeoff, Sparkles } from "lucide-react";

/** Secção principal (hero) da Landing Page — estética editorial. */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="relative py-24 text-center md:py-32">
        <span className="glass-surface mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-[#57534E]">
          <Sparkles className="h-3.5 w-3.5 text-[#8C7A6B]" />
          Planejamento pessoal, gratuito e sem anúncios
        </span>
        <h1 className="mx-auto max-w-3xl font-serif text-5xl font-bold leading-[1.05] text-[#1C1917] md:text-7xl">
          Planeje viagens a dois,{" "}
          <span className="italic text-[#8C7A6B]">sem complicações</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#57534E]">
          Pesquise voos e hospedagens nos melhores sites, organize o roteiro e
          controle as finanças da dupla — tudo num só lugar. O PlannerDuo
          encontra as opções e leva você direto às páginas certas.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/registo" size="lg" variant="primary">
            <PlaneTakeoff className="h-5 w-5" />
            Começar a planejar
          </Button>
          <Button href="#como-funciona" size="lg" variant="secondary">
            Ver como funciona
          </Button>
        </div>
      </Container>
    </section>
  );
}
