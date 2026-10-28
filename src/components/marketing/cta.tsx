import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

/** Chamada final para ação da Landing Page. */
export function CTA() {
  return (
    <section id="financas" className="py-24">
      <Container>
        <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-10 text-center md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-64 w-64 rounded-full bg-accent/10 blur-3xl"
          />
          <h2 className="relative font-serif text-3xl font-bold text-zinc-50 md:text-4xl">
            A próxima viagem a dois começa agora
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-zinc-400">
            Crie a sua conta gratuita e comece a planear em minutos. Sem cartão,
            sem compromissos.
          </p>
          <div className="relative mt-8 flex justify-center">
            <Button href="/registo" size="lg" variant="primary">
              Criar conta gratuita
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
