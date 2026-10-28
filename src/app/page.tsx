import { PublicNav } from "@/components/marketing/public-nav";
import { Hero } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { CTA } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";

/**
 * Landing Page do PlannerDuo.
 * Estrutura: navegação pública -> hero -> recursos -> como funciona -> CTA -> rodapé.
 */
export default function LandingPage() {
  return (
    <>
      <PublicNav />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
