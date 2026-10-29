import { Footer } from "@/components/marketing/footer";
import { PublicNav } from "@/components/marketing/public-nav";
import { TermsContent } from "@/components/legal/terms-content";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Termos de uso & LGPD — PlannerDuo" };

/** Página pública de Termos de Uso e LGPD. */
export default function TermosPublicPage() {
  return (
    <>
      <PublicNav />
      <main className="flex-1 pt-32 pb-20">
        <Container className="max-w-3xl">
          <Card className="rounded-3xl p-8 md:p-12">
            <TermsContent />
          </Card>
        </Container>
      </main>
      <Footer />
    </>
  );
}
