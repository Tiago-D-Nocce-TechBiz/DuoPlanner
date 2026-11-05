import { describe, expect, it } from "vitest";
import {
  emailAlertaPreco,
  emailConvite,
  emailResumoSemanal,
  escaparHtml,
  linkSeguro,
  textoLimpo,
  type DadosEmailAlerta,
  type DadosEmailResumo,
} from "./templates";

/** O Intl usa espaço não separável em "R$ 1.234,56". */
const n = (s: string) => s.replace(/\u00a0/g, " ");

describe("utilitários dos e-mails", () => {
  it("escapa os caracteres especiais do HTML", () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("limpa texto digitado: controle, espaços repetidos e tamanho", () => {
    expect(textoLimpo("  Ana\n\t  Clara \u0007 ")).toBe("Ana Clara");
    expect(textoLimpo("x".repeat(80), 10)).toBe(`${"x".repeat(9)}…`);
  });

  it("só aceita links https (ou http em localhost)", () => {
    expect(linkSeguro("https://duoplanner.app/a?b=1")).toBe("https://duoplanner.app/a?b=1");
    expect(linkSeguro("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(linkSeguro("http://site.com")).toBeNull();
    expect(linkSeguro("javascript:alert(1)")).toBeNull();
    expect(linkSeguro("não é link")).toBeNull();
    expect(linkSeguro(null)).toBeNull();
  });
});

const alerta: DadosEmailAlerta = {
  nome: "Ana",
  tipo: "voo",
  origem: "São Paulo",
  destino: "Lisboa",
  ida: "2026-12-01",
  volta: "2026-12-10",
  adultos: 2,
  precoAtual: 2850,
  precoAlvo: 3000,
  precoAnterior: null,
  detalhe: "LATAM · voo direto",
  linkOferta: "https://www.kiwi.com/deep?x=1",
  linkAlerta: "https://duoplanner.app/dashboard/alertas#alerta-1",
  linkPreferencias: "https://duoplanner.app/dashboard/configuracoes",
};

describe("e-mail de queda de preço", () => {
  it("monta assunto, valores e os dois links", () => {
    const e = emailAlertaPreco(alerta);
    expect(n(e.assunto)).toBe("Queda de preço: São Paulo → Lisboa por R$ 2.850,00");
    expect(n(e.html)).toContain("abaixo do seu alvo de R$ 3.000,00");
    expect(e.html).toContain('href="https://www.kiwi.com/deep?x=1"');
    expect(e.html).toContain("#alerta-1");
    expect(e.texto).toContain("Ver a oferta: https://www.kiwi.com/deep?x=1");
    expect(e.texto).toContain("Desligar os avisos por e-mail: https://duoplanner.app/dashboard/configuracoes");
  });

  it("não deixa nome nem destino virarem HTML", () => {
    const e = emailAlertaPreco({ ...alerta, nome: "<b>Ana</b>", destino: `<img src=x onerror="alert(1)">` });
    expect(e.html).not.toContain("<img");
    expect(e.html).not.toContain("<b>Ana");
    expect(e.html).toContain("&lt;img");
  });

  it("link de oferta inseguro cai para o alerta no DuoPlanner", () => {
    const e = emailAlertaPreco({ ...alerta, linkOferta: "javascript:alert(1)" });
    expect(e.html).not.toContain("javascript:");
    expect(e.html).toContain("Abrir o alerta no DuoPlanner");
    expect(e.texto).not.toContain("Ver a oferta");
  });

  it("mostra quanto caiu desde o último aviso e trata hospedagem", () => {
    const voo = emailAlertaPreco({ ...alerta, precoAnterior: 3000, precoAtual: 2700 });
    expect(n(voo.texto)).toContain("Caiu 10% desde o último aviso (R$ 3.000,00).");
    const hotel = emailAlertaPreco({ ...alerta, tipo: "hospedagem", precoAtual: 3000 });
    expect(n(hotel.assunto)).toBe("Queda de preço: hospedagem em Lisboa por R$ 3.000,00");
    expect(n(hotel.texto)).toContain("A hospedagem em Lisboa (01/12 a 10/12, 2 hóspedes) chegou a R$ 3.000,00, no seu alvo");
    expect(hotel.texto).toContain("total da estadia");
  });
});

describe("e-mail de convite", () => {
  const convite = { nomeConvidante: "Ana", nomeEspaco: "Lua de mel", link: "https://duoplanner.app/convite?code=abc123", validadeDias: 7 };

  it("leva o nome de quem convidou, o espaço e o link", () => {
    const e = emailConvite(convite);
    expect(e.assunto).toBe("Ana convidou você para planejar a viagem no DuoPlanner");
    expect(e.html).toContain("“Lua de mel”");
    expect(e.html).toContain('href="https://duoplanner.app/convite?code=abc123"');
    expect(e.texto).toContain("Aceitar o convite: https://duoplanner.app/convite?code=abc123");
    expect(e.texto).toContain("vale por 7 dias");
  });

  it("nome digitado por quem convida não vira HTML e é encurtado no assunto", () => {
    const e = emailConvite({ ...convite, nomeConvidante: `<script>x</script>${"a".repeat(80)}` });
    expect(e.html).not.toContain("<script>");
    expect(e.assunto.length).toBeLessThan(110);
  });

  it("sem link seguro não monta o convite", () => {
    expect(() => emailConvite({ ...convite, link: "http://phishing.example/convite" })).toThrow();
  });
});

const resumo: DadosEmailResumo = {
  nome: "Bruno",
  periodo: { inicio: "2026-10-26", fim: "2026-11-01" },
  nomeEspaco: "Nossa Viagem",
  totalCompartilhado: 1240.5,
  qtdCompartilhado: 6,
  porCategoria: [
    { categoria: "Hospedagem", total: 900 },
    { categoria: "Alimentação & Gastronomia", total: 340.5 },
  ],
  totalPrivado: 80,
  qtdPrivado: 2,
  semCotacao: 0,
  acerto: { situacao: "pagar", valor: 120, nomePar: "Ana", regra: "Divisão igual (50/50)" },
  linkFinancas: "https://duoplanner.app/dashboard/financas",
  linkAcerto: "https://duoplanner.app/dashboard/acerto",
  linkPreferencias: "https://duoplanner.app/dashboard/configuracoes",
};

describe("e-mail do resumo semanal", () => {
  it("resume a viagem, o que é só seu e o acerto", () => {
    const e = emailResumoSemanal(resumo);
    expect(n(e.assunto)).toBe("Resumo da semana (26/10 a 01/11): R$ 1.240,50 em gastos da viagem");
    expect(n(e.texto)).toContain("Total: R$ 1.240,50 (6 gastos)");
    expect(n(e.texto)).toContain("- Hospedagem: R$ 900,00");
    expect(n(e.texto)).toContain("R$ 80,00 (2 gastos). Só você vê este valor.");
    expect(n(e.texto)).toContain("Você tem R$ 120,00 a acertar com Ana.");
    expect(e.texto).toContain("Ver o acerto e o Pix: https://duoplanner.app/dashboard/acerto");
  });

  it("muda a frase do acerto conforme o saldo", () => {
    expect(n(emailResumoSemanal({ ...resumo, acerto: { ...resumo.acerto!, situacao: "receber" } }).texto)).toContain(
      "Ana tem R$ 120,00 a acertar com você."
    );
    const quites = emailResumoSemanal({ ...resumo, acerto: { ...resumo.acerto!, situacao: "quites", valor: 0 } });
    expect(quites.texto).toContain("Vocês estão quites");
    expect(quites.texto).not.toContain("Ver o acerto e o Pix");
  });

  it("sem gastos da viagem nem privados, diz isso e esconde a seção privada", () => {
    const e = emailResumoSemanal({ ...resumo, qtdCompartilhado: 0, totalCompartilhado: 0, porCategoria: [], qtdPrivado: 0, totalPrivado: 0 });
    expect(e.assunto).toBe("Resumo da semana (26/10 a 01/11): seus gastos e o acerto");
    expect(e.texto).toContain("Nenhum gasto da viagem lançado nesta semana.");
    expect(e.texto).not.toContain("SÓ SEUS");
  });
});
