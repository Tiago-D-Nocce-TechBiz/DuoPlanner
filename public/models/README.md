# Modelos 3D

Coloque aqui o modelo do avião da landing page.

## Arquivo esperado

- Caminho: `public/models/aviao.glb`
- Formato: **glTF binário (.glb)** — um único arquivo com geometria, materiais e texturas.

Assim que esse arquivo existir, a cena 3D (`src/components/marketing/plane-scene.tsx`)
carrega e exibe o modelo automaticamente, girável em 3D. Sem o arquivo, a cena
usa um avião procedural de fallback (não quebra).

O modelo é centralizado e redimensionado automaticamente (via `<Bounds>`/`<Center>`),
então não importa a escala/orientação com que ele foi exportado.

## Onde baixar (modelos com licença livre)

- Poly Pizza — https://poly.pizza (CC0/CC-BY, muitos aviões low-poly)
- Sketchfab — https://sketchfab.com (filtre por "Downloadable" + licença CC0/CC-BY; baixe em glTF/.glb)
- Khronos glTF Sample Assets — https://github.com/KhronosGroup/glTF-Sample-Assets
- Quaternius — https://quaternius.com (packs CC0)

## Licença (importante)

- Prefira **CC0** (uso livre, sem exigências) ou **CC-BY** (precisa creditar o autor).
- Evite modelos com restrições de redistribuição ou de uso comercial se for publicar.
- Evite réplicas de aeronaves com marcas/logotipos de companhias reais (direitos de marca);
  prefira um jato comercial genérico.
- Se usar CC-BY, registre o crédito do autor (nome + link) na página ou neste arquivo.
