# Dashboard (React + Vite)

Front-end do Emprego Agro Paraná. Visão geral do projeto e metodologia: [../README.md](../README.md) e [../docs/CONTRATO-DADOS.md](../docs/CONTRATO-DADOS.md).

```bash
npm ci               # instala exatamente o package-lock.json (.npmrc: legacy-peer-deps, ver abaixo)
npm run dev          # http://localhost:5173/emprego-agro-parana/
npm test             # node --test: motor (src/engine) e utilitários (src/utils)
npx eslint src       # deve terminar sem erros
npm run build        # gera dist/ (base /emprego-agro-parana/)
npx vite preview     # serve o build
```

- Dados lidos de `public/data/v2/` (`dims.json`, `agregado.json`, `cubo/*.json`), gerados pelo pipeline em `../scripts/`.
- Toda métrica exibida vem de `src/engine` (`aggregate`); o App só mantém o estado de filtros (`src/utils/filters.js`).
- Strings novas da interface precisam de entrada `[pt, en, es]` em `public/i18n/i18n-text-map.js` (o runtime traduz pelo texto PT exato).
- `.npmrc` mantém `legacy-peer-deps=true` porque `lucide-react@0.294` declara peer `react` até 18 e o projeto usa React 19.
