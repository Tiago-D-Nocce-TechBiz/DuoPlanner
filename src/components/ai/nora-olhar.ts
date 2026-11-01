/**
 * Olhar da Nora: faz os olhos de todos os avatares seguirem o cursor com UM
 * único listener de `mousemove` (passivo) para a página inteira.
 *
 * Antes, cada avatar registrava o próprio listener e lia
 * `getBoundingClientRect` a cada evento, e cada mensagem da Nora no chat tem
 * um avatar. Agora o evento só guarda a posição do cursor; um
 * `requestAnimationFrame` por quadro lê as posições dos avatares visíveis e
 * depois escreve as transformações (leituras antes de escritas). Avatares
 * fora da tela (painel fechado) são pulados. Com "reduzir movimento" ligado
 * no sistema, os olhos ficam parados.
 */

export interface Retangulo {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Ponto {
  x: number;
  y: number;
}

/**
 * Deslocamento das pupilas na direção do cursor, limitado a `raio`. Perto do
 * centro do avatar o deslocamento diminui, para os olhos não tremerem.
 */
export function calcularDeslocamento(rect: Retangulo, cursor: Ponto, raio: number): Ponto {
  const dx = cursor.x - (rect.left + rect.width / 2);
  const dy = cursor.y - (rect.top + rect.height / 2);
  const distancia = Math.hypot(dx, dy);
  if (distancia < 0.5) return { x: 0, y: 0 };
  const fator = Math.min(1, distancia / Math.max(rect.width, 1));
  return {
    x: (dx / distancia) * raio * fator,
    y: (dy / distancia) * raio * fator,
  };
}

interface Registro {
  face: HTMLElement;
  olhos: HTMLElement;
  raio: number;
}

const registros = new Set<Registro>();
let cursor: Ponto | null = null;
let quadro: number | null = null;
let ouvindo = false;

function atualizar() {
  quadro = null;
  if (!cursor) return;
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  const escritas: { olhos: HTMLElement; transform: string }[] = [];
  for (const r of registros) {
    const rect = r.face.getBoundingClientRect();
    const foraDaTela =
      rect.width === 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= largura || rect.top >= altura;
    if (foraDaTela) continue;
    const d = calcularDeslocamento(rect, cursor, r.raio);
    escritas.push({ olhos: r.olhos, transform: `translate(${d.x.toFixed(2)}px, ${d.y.toFixed(2)}px)` });
  }
  for (const e of escritas) e.olhos.style.transform = e.transform;
}

function agendar() {
  if (quadro === null) quadro = window.requestAnimationFrame(atualizar);
}

function aoMover(e: MouseEvent) {
  cursor = { x: e.clientX, y: e.clientY };
  agendar();
}

function reduzirMovimento(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Registra um avatar; devolve a função que o remove (use no cleanup do efeito). */
export function registrarOlhar(face: HTMLElement, olhos: HTMLElement, raio: number): () => void {
  if (typeof window === "undefined" || reduzirMovimento()) return () => {};
  const registro: Registro = { face, olhos, raio };
  registros.add(registro);
  if (!ouvindo) {
    window.addEventListener("mousemove", aoMover, { passive: true });
    ouvindo = true;
  }
  // Avatar novo já olha para a última posição conhecida do cursor.
  if (cursor) agendar();

  return () => {
    registros.delete(registro);
    if (registros.size === 0 && ouvindo) {
      window.removeEventListener("mousemove", aoMover);
      ouvindo = false;
      if (quadro !== null) {
        window.cancelAnimationFrame(quadro);
        quadro = null;
      }
    }
  };
}

let contador = 0;

/** Atraso da piscada por avatar, para não piscarem todos juntos. */
export function proximoAtrasoDePiscada(): number {
  contador = (contador + 1) % 1000;
  return Number(((contador * 1.37) % 5.2).toFixed(2));
}
