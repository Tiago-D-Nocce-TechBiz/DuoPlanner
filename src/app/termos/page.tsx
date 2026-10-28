import { PublicNav } from "@/components/marketing/public-nav";
import { Footer } from "@/components/marketing/footer";
import { Container } from "@/components/ui/container";
import { TermsContent } from "@/components/legal/terms-content";

export const metadata = { title: "Termos de uso & LGPD — PlannerDuo" };

/** Página pública de Termos de Uso e LGPD. */
export default function TermosPublicPage() {
  return (
    <>
      <PublicNav />
      <main className="flex-1 pt-32 pb-20">
        <Container className="max-w-3xl">
          <div className="glass-surface rounded-3xl p-8 md:p-12">
            <TermsContent />
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
