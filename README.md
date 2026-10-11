# Emprego Agro Paraná: emprego formal na agropecuária

Dashboard de admissões, desligamentos, saldo e salários do emprego formal na agropecuária paranaense (CNAE seção A: divisões 01, 02 e 03), a partir dos microdados do **Novo CAGED (MTE)**, de 2020-01 ao último mês publicado. Sete abas temáticas com filtros regionais e cross-filter por clique em todos os gráficos, tabelas e no mapa.

**🔗 [Acessar dashboard](https://avnergomes.github.io/emprego-agro-parana/)**

Parte do ecossistema **[Datageo Paraná](https://datageoparana.github.io)**.

## Metodologia (resumo)

A especificação completa e única está em [docs/CONTRATO-DADOS.md](docs/CONTRATO-DADOS.md); a comparação com a versão anterior dos dados está em [docs/RECONCILIACAO.md](docs/RECONCILIACAO.md).

- Recorte: UF 41 (Paraná) e seção CNAE A; 122 subclasses mapeadas para cadeias produtivas.
- Série por competência com ajustes: arquivos `CAGEDMOV`, `CAGEDFOR` (declarações fora do prazo, peso +1) e `CAGEDEXC` (exclusões, peso −1) de cada mês de divulgação. Sem remoção de duplicatas: registros idênticos são movimentos distintos.
- Salário médio: regra oficial do MTE (só admissões, sem contrato intermitente, entre 0,3 e 150 salários mínimos da competência); valores nominais.
- Mediana e percentis salariais são **estimados** por interpolação linear em faixas salariais.
- LGPD: qualquer salário com menos de 5 admissões na regra é suprimido na exibição ("—", amostra insuficiente). Os arquivos de cubo publicados (`v2/cubo/*.json`) contêm células com n pequeno (inclusive n=1) e somas de salário e idade; elas reproduzem, com menos detalhe (sem CBO nem raça, idade em faixa), o microdado público e desidentificado do MTE.
- Validação: o saldo de 2026-08 (−73) bate com o número oficial do MTE; um oráculo Python independente (`scripts/tests/oracle.py`) recalcula as saídas do motor a partir do fato.

## Arquitetura (v2)

```
FTP MTE ──► scripts/run_pipeline.py ──► data/fact/caged_agro_pr.parquet (fato, 1 linha por registro)
                                    └─► dashboard/public/data/v2/
                                          dims.json        dicionários (períodos, municípios, regionais, cadeias...)
                                          cubo/{regional}.json   cubo colunar, uma partição por regional IDR
                                          agregado.json    saída do motor sem filtros (scripts/build_agregado.mjs)
```

No navegador, o **motor de agregação** (`dashboard/src/engine/`, JS puro e testado) calcula todas as saídas numa passada sobre o cubo:

- sem filtro, o app usa `agregado.json`;
- com filtro, `loader.loadCube(requiredPartitions(dims, filtros))` baixa só as regionais necessárias (ou todas, para filtros não regionais) e `aggregate()` produz KPIs, séries, rankings, perfil e salários;
- cada gráfico aplica todos os filtros menos o da própria dimensão, que vira destaque (cross-filter);
- enquanto um recorte carrega, a interface mostra estado de carregamento, nunca números do recorte anterior.

Filtros: mesorregião, regional IDR, município (hierárquicos, listas de `dims.json`), cadeia, CNAE, ano ou mês, sexo, faixa etária, escolaridade e porte. Todos aparecem em "Filtros ativos", com remoção individual.

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS 3 |
| Gráficos | Recharts 2, D3.js |
| Mapa | SVG próprio sobre a malha municipal TopoJSON do Datageo (só geometria) |
| Pipeline | Python 3.12 (pandas, pyarrow, py7zr) |
| Deploy | GitHub Pages via GitHub Actions |
| Idiomas | PT, EN, ES (`dashboard/public/i18n/`) |

## Estrutura

```
emprego-agro-parana/
├── dashboard/
│   ├── src/
│   │   ├── App.jsx           # estado de filtros e layout; métricas só do motor
│   │   ├── engine/           # motor de agregação + loader (com testes)
│   │   ├── components/       # abas e gráficos
│   │   └── utils/            # filtros, formatação, hooks (com testes)
│   └── public/data/v2/       # dims, cubo particionado, agregado
├── scripts/                  # pipeline Python, build_agregado.mjs e testes (scripts/tests)
├── data/fact/                # fato versionado + manifest.json do FTP
├── docs/                     # CONTRATO-DADOS.md, RECONCILIACAO.md
└── .github/workflows/        # data-pipeline.yml, deploy.yml
```

## Desenvolvimento local

```bash
cd dashboard
npm ci
npm run dev          # servidor de desenvolvimento
npm test             # testes do motor e dos utilitários (node --test)
npx eslint src       # lint
npm run build        # build de produção
```

Pipeline de dados (a partir da raiz):

```bash
pip install -r requirements.txt
python scripts/run_pipeline.py      # baixa do FTP o que mudou, atualiza fato, dims e cubo
node scripts/build_agregado.mjs     # gera agregado.json com o motor JS
python -m unittest discover scripts/tests
```

O workflow `data-pipeline.yml` executa essas etapas e as checagens de consistência (motor JS × oráculo Python) antes de publicar os dados.

## Licença

Dados públicos (Novo CAGED/MTE). Dashboard desenvolvido por [Avner Gomes](https://avnergomes.github.io/portfolio/).
