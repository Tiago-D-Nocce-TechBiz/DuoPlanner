import { describe, expect, it } from "vitest";
import {
  campoTexto,
  erroEmailJaCadastrado,
  esquemaCadastro,
  esquemaLogin,
  mensagemCadastroNeutra,
  primeiraMensagem,
} from "./validacao";

describe("esquemaLogin", () => {
  it("normaliza o e-mail (espaços e maiúsculas)", () => {
    const r = esquemaLogin.safeParse({ email: "  Tiago@Exemplo.COM ", senha: "segredo1" });
    expect(r.success && r.data.email).toBe("tiago@exemplo.com");
  });

  it.each(["", "tiago", "tiago@", "@exemplo.com", "tiago@exemplo", "a b@c.com"])(
    "recusa e-mail inválido %j",
    (email) => {
      const r = esquemaLogin.safeParse({ email, senha: "x" });
      expect(r.success).toBe(false);
    }
  );

  it("recusa senha vazia ou acima do limite do bcrypt (72)", () => {
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "x".repeat(73) }).success).toBe(false);
    expect(esquemaLogin.safeParse({ email: "a@b.com", senha: "x".repeat(72) }).success).toBe(true);
  });

  it("campos opcionais ausentes ou longos viram string vazia (não derrubam o login)", () => {
    const r = esquemaLogin.safeParse({ email: "a@b.com", senha: "x", redirect: "y".repeat(500) });
    expect(r.success && r.data).toMatchObject({ redirect: "", codigoConvite: "" });
  });
});

describe("esquemaCadastro", () => {
  it("exige 8+ caracteres com letra e número", () => {
    const base = { email: "a@b.com", nome: "Ana" };
    expect(primeiraMensagem(esquemaCadastro.safeParse({ ...base, senha: "abc12" }).error!)).toBe(
      "A senha deve ter pelo menos 8 caracteres."
    );
    expect(esquemaCadastro.safeParse({ ...base, senha: "abcdefgh" }).success).toBe(false);
    expect(esquemaCadastro.safeParse({ ...base, senha: "12345678" }).success).toBe(false);
    expect(esquemaCadastro.safeParse({ ...base, senha: "viagem2027" }).success).toBe(true);
  });
});

describe("anti-enumeração", () => {
  it("a resposta neutra do cadastro não diz se o e-mail já existe", () => {
    for (const msg of [mensagemCadastroNeutra(false), mensagemCadastroNeutra(true)]) {
      expect(msg).toMatch(/Se este e-mail puder ser usado/);
      expect(msg).not.toMatch(/já (tem|possui) (uma )?conta|já cadastrado|existe/i);
    }
  });

  it("reconhece o erro de e-mail já cadastrado do Supabase", () => {
    expect(erroEmailJaCadastrado("User already registered")).toBe(true);
    expect(erroEmailJaCadastrado("A user with this email address has already been registered")).toBe(true);
    expect(erroEmailJaCadastrado("Password should be at least 8 characters")).toBe(false);
  });
});

describe("campoTexto", () => {
  it("lê o primeiro campo de texto existente e ignora arquivos", () => {
    const fd = new FormData();
    fd.set("password", "abc");
    fd.set("arquivo", new Blob(["x"]), "x.txt");
    expect(campoTexto(fd, "senha", "password")).toBe("abc");
    expect(campoTexto(fd, "arquivo")).toBeUndefined();
    expect(campoTexto(fd, "inexistente")).toBeUndefined();
  });
});
