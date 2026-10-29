import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

/** Chamada final para ação da Landing Page. */
export function CTA() {
  return (
    <section id="financas" className="py-24">
      <Container>
        <Card className="rounded-3xl p-10 text-center md:p-16">
          <h2 className="font-serif text-4xl font-semibold md:text-5xl">
            A próxima viagem a dois começa agora
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Crie a sua conta gratuita e comece a planejar em minutos. Sem cartão,
            sem compromissos.
          </p>
          <div className="mt-8 flex justify-center">
            <Button href="/registo" size="lg" variant="primary">
              Criar conta gratuita
            </Button>
          </div>
        </Card>
      </Container>
    </section>
  );
}
