import { describe, expect, it } from "vitest";
import { analisarAmbiente, descreverAmbiente, ErroDeAmbiente, type FonteAmbiente } from "./esquema";
import { SITE_URL_PADRAO } from "./validadores";

/** JWT no formato das chaves antigas do Supabase (só o papel importa). */
function jwt(role: string): string {
  const corpo = Buffer.from(JSON.stringify({ iss: "supabase", role })).toString("base64url");
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${corpo}.assinatura`;
}

const CHAVE_32 = Buffer.alloc(32, 7).toString("base64");

const COMPLETO: FonteAmbiente = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co/",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123",
  NEXT_PUBLIC_SITE_URL: "https://duo.example.com",
  SUPABASE_SECRET_KEY: "sb_secret_xyz789",
  GEMINI_API_KEY: "AIza-teste",
  GEMINI_MODEL: "gemini-3.8-flash",
  KIWI_API_KEY: "kiwi-teste",
  RAPIDAPI_KEY: "rapid-teste",
  RAPIDAPI_BOOKING_HOST: "booking-com15.p.rapidapi.com",
  RESEND_API_KEY: "re_teste",
  EMAIL_REMETENTE: "DuoPlanner <alertas@duo.example.com>",
  CRON_SECRET: "0123456789abcdef0123",
  DOCUMENTOS_CHAVE_CRIPTO: CHAVE_32,
};

function erros(fonte: FonteAmbiente) {
  const r = analisarAmbiente(fonte);
  if (r.ok) throw new Error("esperava erro de ambiente");
  return r.erros;
}

function ok(fonte: FonteAmbiente) {
  const r = analisarAmbiente(fonte);
  if (!r.ok) throw new Error(descreverAmbiente(r));
  return r;
}

describe("analisarAmbiente: modo degradado", () => {
  it("sem variável nenhuma: sobe com tudo degradado, sem erro", () => {
    const r = ok({});
    expect(Object.values(r.integracoes).every((i) => !i.ativa)).toBe(true);
    expect(r.ambiente.siteUrl).toBe(SITE_URL_PADRAO);
    expect(r.ambiente.siteUrlConfigurada).toBe(false);
    expect(r.ambiente.supabase).toBeNull();
    expect(r.ambiente.chaveDocumentos).toBeNull();
  });

  it("linha vazia do .env (CHAVE=) conta como ausente, não como valor inválido", () => {
    const r = ok({ CRON_SECRET: "", NEXT_PUBLIC_SUPABASE_URL: "   ", DOCUMENTOS_CHAVE_CRIPTO: "" });
    expect(r.ambiente.cronSecret).toBeNull();
    expect(r.ambiente.supabase).toBeNull();
    expect(r.integracoes.criptografiaDocumentos.ativa).toBe(false);
  });

  it("cada integração diz o que o app faz sem ela", () => {
    const r = ok({});
    for (const status of Object.values(r.integracoes)) {
      expect(status.semEla.length).toBeGreaterThan(10);
      expect(status.variaveis.length).toBeGreaterThan(0);
    }
    expect(r.integracoes.ia.semEla).toMatch(/catálogo local/);
  });
});

describe("analisarAmbiente: configuração completa", () => {
  it("liga todas as integrações e normaliza as URLs", () => {
    const r = ok(COMPLETO);
    expect(Object.values(r.integracoes).every((i) => i.ativa)).toBe(true);
    expect(r.ambiente.supabase).toEqual({ url: "https://abcd.supabase.co", chavePublica: "sb_publishable_abc123" });
    expect(r.ambiente.supabaseAdmin?.chaveSecreta).toBe("sb_secret_xyz789");
    expect(r.ambiente.ia).toEqual({ apiKey: "AIza-teste", modelo: "gemini-3.8-flash", baseUrl: null });
    expect(r.ambiente.chaveDocumentos?.length).toBe(32);
    expect(r.avisos).toEqual([]);
  });

  it("aceita a chave anon JWT antiga e GOOGLE_API_KEY como alternativa", () => {
    const r = ok({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
      GOOGLE_API_KEY: "AIza-google",
    });
    expect(r.integracoes.supabase.ativa).toBe(true);
    expect(r.ambiente.ia?.apiKey).toBe("AIza-google");
  });

  it("http só é aceito em localhost (desenvolvimento)", () => {
    expect(ok({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }).ambiente.siteUrl).toBe("http://localhost:3000");
    expect(erros({ NEXT_PUBLIC_SITE_URL: "http://duo.example.com" })[0].variavel).toBe("NEXT_PUBLIC_SITE_URL");
  });

  it("tarefas agendadas exigem a chave secreta E o CRON_SECRET", () => {
    const semCron = ok({ ...COMPLETO, CRON_SECRET: undefined });
    expect(semCron.integracoes.tarefasAgendadas.ativa).toBe(false);
    const semSecreta = ok({ ...COMPLETO, SUPABASE_SECRET_KEY: undefined });
    expect(semSecreta.integracoes.tarefasAgendadas.ativa).toBe(false);
    expect(semSecreta.avisos.map((a) => a.variavel)).toContain("SUPABASE_SECRET_KEY");
  });
});

describe("analisarAmbiente: fail-fast em valor malformado", () => {
  it("chave secreta numa NEXT_PUBLIC_ (iria para o navegador)", () => {
    expect(erros({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_vazada" }).map((e) => e.variavel)).toContain(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    expect(
      erros({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") }).map(
        (e) => e.variavel
      )
    ).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("procura chave secreta em qualquer NEXT_PUBLIC_, não só nas conhecidas", () => {
    const lista = erros({ NEXT_PUBLIC_QUALQUER: "sb_secret_vazada" });
    expect(lista).toEqual([expect.objectContaining({ variavel: "NEXT_PUBLIC_QUALQUER" })]);
  });

  it("configuração parcial do Supabase", () => {
    expect(erros({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" })[0].variavel).toBe(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    expect(erros({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" })[0].variavel).toBe("NEXT_PUBLIC_SUPABASE_URL");
    expect(erros({ SUPABASE_SECRET_KEY: "sb_secret_x" })[0].variavel).toBe("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("chave pública no lugar da secreta", () => {
    expect(erros({ ...COMPLETO, SUPABASE_SECRET_KEY: "sb_publishable_abc123" })[0].variavel).toBe("SUPABASE_SECRET_KEY");
    expect(erros({ ...COMPLETO, SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: jwt("anon") })[0].variavel).toBe(
      "SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("URL inválida", () => {
    expect(erros({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: "abcd.supabase.co" }).map((e) => e.variavel)).toContain(
      "NEXT_PUBLIC_SUPABASE_URL"
    );
    expect(erros({ GEMINI_API_BASE_URL: "https://usuario:senha@proxy.example.com" })[0].variavel).toBe("GEMINI_API_BASE_URL");
  });

  it("CRON_SECRET curto demais", () => {
    expect(erros({ ...COMPLETO, CRON_SECRET: "curto" })[0].variavel).toBe("CRON_SECRET");
    expect(ok({ CRON_SECRET: "x".repeat(16) }).ambiente.cronSecret).toHaveLength(16);
  });

  it("chave de cifra que não tem 32 bytes", () => {
    expect(erros({ DOCUMENTOS_CHAVE_CRIPTO: Buffer.alloc(16, 1).toString("base64") })[0].variavel).toBe(
      "DOCUMENTOS_CHAVE_CRIPTO"
    );
    expect(erros({ DOCUMENTOS_CHAVE_CRIPTO: "isto não é base64!" })[0].variavel).toBe("DOCUMENTOS_CHAVE_CRIPTO");
    expect(ok({ DOCUMENTOS_CHAVE_CRIPTO: Buffer.alloc(32, 9).toString("base64url") }).integracoes.criptografiaDocumentos.ativa).toBe(
      true
    );
  });

  it("remetente, modelo e host malformados", () => {
    expect(erros({ EMAIL_REMETENTE: "DuoPlanner alertas@" })[0].variavel).toBe("EMAIL_REMETENTE");
    expect(ok({ EMAIL_REMETENTE: "alertas@duo.example.com" }).ok).toBe(true);
    expect(erros({ GEMINI_MODEL: "Gemini 3 Flash" })[0].variavel).toBe("GEMINI_MODEL");
    expect(erros({ RAPIDAPI_BOOKING_HOST: "https://booking-com15.p.rapidapi.com/" })[0].variavel).toBe(
      "RAPIDAPI_BOOKING_HOST"
    );
  });

  it("junta todos os erros de uma vez (um deploy corrige tudo)", () => {
    const lista = erros({ CRON_SECRET: "curto", GEMINI_MODEL: "x y", NEXT_PUBLIC_SITE_URL: "ftp://x" });
    expect(lista.map((e) => e.variavel).sort()).toEqual(["CRON_SECRET", "GEMINI_MODEL", "NEXT_PUBLIC_SITE_URL"]);
  });
});

describe("analisarAmbiente: avisos", () => {
  it("produção sem URL pública, sem remetente e com chave da Resend estranha", () => {
    const r = ok({ NODE_ENV: "production", RESEND_API_KEY: "chave-qualquer" });
    expect(r.avisos.map((a) => a.variavel).sort()).toEqual(["EMAIL_REMETENTE", "NEXT_PUBLIC_SITE_URL", "RESEND_API_KEY"]);
  });

  it("as duas chaves públicas definidas: avisa qual vale", () => {
    const r = ok({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_novo",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
    });
    expect(r.ambiente.supabase?.chavePublica).toBe("sb_publishable_novo");
    expect(r.avisos.map((a) => a.variavel)).toEqual(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  });
});

describe("descreverAmbiente e ErroDeAmbiente", () => {
  it("o relatório lista ativas e degradadas", () => {
    const texto = descreverAmbiente(analisarAmbiente({ GEMINI_API_KEY: "AIza" }));
    expect(texto).toMatch(/\[ativa\]\s+IA \(Gemini\)/);
    expect(texto).toMatch(/\[degradada\] E-mails \(Resend\): Nenhum e-mail sai/);
  });

  it("a mensagem de erro nomeia a variável e nunca mostra o valor (segredo)", () => {
    const r = analisarAmbiente({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_NAO_PODE_VAZAR", CRON_SECRET: "c1" });
    if (r.ok) throw new Error("esperava erro");
    const erro = new ErroDeAmbiente(r.erros);
    expect(erro.message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(erro.message).toContain("CRON_SECRET");
    expect(erro.message).not.toContain("sb_secret_NAO_PODE_VAZAR");
    expect(erro.message).not.toContain("c1\n");
  });
});

describe("imports do esquema", () => {
  it("só relativos em todo o grafo (o next.config.ts não resolve o alias @/ em arquivos aninhados)", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const visitados = new Set<string>();
    const comAlias: string[] = [];
    const visitar = (arquivo: string) => {
      if (visitados.has(arquivo)) return;
      visitados.add(arquivo);
      const fonte = readFileSync(arquivo, "utf8");
      for (const [, especificador] of fonte.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm)) {
        if (especificador.startsWith("@/")) comAlias.push(`${arquivo}: ${especificador}`);
        else if (especificador.startsWith(".")) visitar(resolve(dirname(arquivo), `${especificador}.ts`));
      }
    };
    visitar(resolve(dirname(fileURLToPath(import.meta.url)), "esquema.ts"));

    expect(visitados.size).toBeGreaterThanOrEqual(4);
    expect(comAlias).toEqual([]);
  });
});
