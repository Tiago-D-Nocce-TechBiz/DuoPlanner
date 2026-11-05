/**
 * Conteúdo jurídico dos Termos de Uso + LGPD do DuoPlanner.
 * Reutilizado na rota pública (/termos) e no painel (/dashboard/termos).
 *
 * AVISO: texto-modelo para um app pessoal e gratuito. Não substitui
 * aconselhamento jurídico profissional; revise antes de publicar.
 */

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-serif text-2xl font-semibold text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </section>
  );
}

export function TermsContent() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="font-serif text-4xl font-bold text-heading">
          Termos de Uso &amp; Política de Privacidade (LGPD)
        </h1>
        <p className="mt-2 text-sm text-muted">
          Última atualização: 5 de novembro de 2026.
        </p>
      </header>

      <Section title="1. Aceitação dos Termos">
        <p>
          Ao acessar e utilizar o DuoPlanner (&quot;Plataforma&quot;), você
          declara ter lido, compreendido e aceitado integralmente estes Termos
          de Uso. Caso não concorde, não utilize a Plataforma.
        </p>
      </Section>

      <Section title="2. Natureza do serviço — agregador e redirecionador">
        <p>
          O DuoPlanner é uma ferramenta pessoal e gratuita de planejamento de
          viagens que funciona como <strong>agregador e redirecionador de
          buscas</strong> (deep linking). A Plataforma não vende passagens,
          não intermedeia reservas e não processa pagamentos.
        </p>
        <p>
          A partir dos dados informados por você (origem, destino, datas,
          passageiros e preferências), geramos <strong>links</strong> que
          direcionam a páginas de terceiros — alguns já com a busca
          preenchida —, como Google Flights, Skyscanner, Decolar, LATAM, Azul,
          GOL, ClickBus, Buser, Booking.com, Airbnb, Trivago e Google Hotels.
          Quando disponíveis, também consultamos APIs de parceiros
          (<strong>Kiwi.com</strong> para voos e <strong>Booking.com</strong>,
          via RapidAPI, para hospedagens) para exibir preços. Preços,
          disponibilidade, condições, reservas e pagamentos são de
          responsabilidade exclusiva dessas plataformas parceiras, regidos
          pelos termos e políticas próprios de cada uma.
        </p>
        <p>
          Recursos de inteligência artificial (a assistente Nora, a memória de
          preferências e as sugestões de experiências) podem conter
          imprecisões. Confira valores, datas, horários e regras antes de
          decidir.
        </p>
        <p>
          O DuoPlanner não garante a exatidão, disponibilidade ou atualização
          das informações exibidas pelos sites de destino e não se
          responsabiliza por eventuais divergências, falhas ou prejuízos
          decorrentes das transações realizadas com terceiros.
        </p>
      </Section>

      <Section title="3. Uso pessoal e não corporativo">
        <p>
          A Plataforma destina-se ao uso pessoal e não corporativo. É vedado o
          uso para fins comerciais, revenda, raspagem automatizada em larga
          escala ou qualquer finalidade ilícita.
        </p>
      </Section>

      <Section title="4. Conta e responsabilidade do usuário">
        <p>
          Você é responsável pela veracidade dos dados informados e pela guarda
          das credenciais de acesso. Atividades realizadas na sua conta são de
          sua responsabilidade.
        </p>
      </Section>

      {/* ------------------------------ LGPD ------------------------------ */}
      <Section id="lgpd" title="5. Privacidade e Proteção de Dados (LGPD)">
        <p>
          Esta seção descreve o tratamento de dados pessoais em conformidade
          com a <strong>Lei nº 13.709/2018 — Lei Geral de Proteção de Dados
          Pessoais (LGPD)</strong>.
        </p>

        <h3 className="pt-2 font-semibold text-heading">5.1. Dados coletados</h3>
        <p>
          Tratamos os seguintes dados, fornecidos por você ou gerados pelo uso:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Itinerários e buscas:</strong> origem, destino, datas,
            número de passageiros/hóspedes, quartos e classe de viagem.
          </li>
          <li>
            <strong>Despesas:</strong> descrição, valor, moeda, data, categoria,
            quem pagou e como dividir, informados por você, lidos de recibos ou
            importados de faturas e extratos (CSV/TXT), incluindo parcelas.
          </li>
          <li>
            <strong>Planejamento da viagem:</strong> roteiro, checklist e
            alertas de preço (rota, datas, viajantes e preço-alvo).
          </li>
          <li>
            <strong>Documentos de viagem:</strong> tipo, titular, validade,
            observações e o número do documento, guardado cifrado.
          </li>
          <li>
            <strong>Dados do acerto de contas:</strong> chave Pix e nome de quem
            recebe, que o seu par vê para pagar o acerto.
          </li>
          <li>
            <strong>Recibos e comprovantes:</strong> a imagem enviada para
            leitura por IA, que não fica guardada.
          </li>
          <li>
            <strong>Preferências e memória da IA:</strong> cidade base,
            aeroporto base, moeda, orçamentos, limites de escala, interesses e
            o histórico das mensagens enviadas à IA para memorizá-los.
          </li>
          <li>
            <strong>Dados de conta:</strong> nome, e-mail de cadastro e as
            preferências de e-mail.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.2. Finalidade e base legal
        </h3>
        <p>
          Os dados são tratados para viabilizar o funcionamento da Plataforma —
          gerar buscas, salvar histórico de viagens e organizar finanças. As
          bases legais aplicáveis são:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Execução de contrato e procedimentos preliminares</strong>{" "}
            (Art. 7º, V, da LGPD), para prestação das funcionalidades
            solicitadas por você.
          </li>
          <li>
            <strong>Consentimento</strong> (Art. 7º, I, da LGPD), quando
            aplicável a tratamentos específicos, revogável a qualquer momento.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.3. Direitos do titular (Art. 18 da LGPD)
        </h3>
        <p>Você pode, a qualquer tempo e mediante requisição, exercer:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Acesso</strong> aos dados tratados;</li>
          <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados;</li>
          <li><strong>Portabilidade</strong> dos dados a outro fornecedor;</li>
          <li>
            <strong>Eliminação imediata</strong> dos dados tratados com
            consentimento, bem como anonimização ou bloqueio de dados
            desnecessários ou tratados em desconformidade.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.4. Armazenamento e o que o seu par vê
        </h3>
        <p>
          Os dados ficam no banco de dados em nuvem do <strong>Supabase</strong>{" "}
          (PostgreSQL), com controle de acesso por linha (Row Level Security) e
          transmissão por conexões criptografadas (HTTPS).
        </p>
        <p>
          Os gastos que você marca como da viagem, o roteiro, o checklist e os
          alertas de preço ficam no espaço do casal: as duas contas veem e
          editam. Gastos pessoais e documentos privados são vistos só por você.
          O número dos documentos é cifrado (AES-256-GCM) antes de chegar ao
          banco, com uma chave guardada fora dele.
        </p>
        <p>
          Para funcionar sem internet, o aplicativo guarda neste aparelho uma
          cópia dos seus dados e das alterações ainda não enviadas. Essa cópia
          é apagada quando você sai da conta.
        </p>

        <h3 className="pt-2 font-semibold text-heading">
          5.5. Compartilhamento com provedores e e-mails
        </h3>
        <p>
          Para executar as funcionalidades pedidas por você, compartilhamos o
          mínimo necessário com operadores:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Google (Gemini API)</strong> recebe os textos enviados à
            memória de preferências e às sugestões de experiências, as imagens
            de recibos para leitura e a descrição e o valor das linhas de uma
            fatura importada, para categorizá-las (sem nome nem e-mail).
          </li>
          <li>
            <strong>Kiwi.com</strong> e <strong>Booking.com/RapidAPI</strong>{" "}
            recebem os parâmetros das buscas e dos alertas de preço (destinos,
            datas e número de viajantes), inclusive na verificação diária
            automática dos alertas.
          </li>
          <li>
            <strong>Resend</strong> recebe o endereço, o nome e o conteúdo dos
            e-mails que enviamos: alertas de queda de preço, resumo semanal do
            orçamento e convites.
          </li>
          <li>
            <strong>Vercel</strong> (hospedagem) e <strong>Supabase</strong>{" "}
            (contas e banco de dados) operam a infraestrutura.
          </li>
        </ul>
        <p>
          Os alertas por e-mail e o resumo semanal podem ser desligados em
          Configurações. O convite por e-mail só vai para o endereço que quem
          convida digitar. Nenhum desses dados é vendido ou usado para
          publicidade.
        </p>

        <h3 className="pt-2 font-semibold text-heading">
          5.6. Canal de contato do Controlador / Encarregado (DPO)
        </h3>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de
          dados, contate o Controlador e Encarregado (DPO):
        </p>
        <ul className="list-none space-y-1 pl-0">
          <li><strong>Responsável:</strong> Tiago D. Nocce (desenvolvedor e controlador)</li>
          <li><strong>E-mail do Encarregado (DPO):</strong> dpo@duoplanner.app</li>
        </ul>
        <p>
          As solicitações serão respondidas nos prazos e na forma previstos pela
          LGPD.
        </p>
      </Section>

      <Section title="6. Alterações destes Termos">
        <p>
          Estes Termos podem ser atualizados periodicamente. A versão vigente é
          sempre a publicada nesta página, com a data de atualização indicada no
          topo.
        </p>
      </Section>

      <Section title="7. Foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
        </p>
      </Section>
    </article>
  );
}
