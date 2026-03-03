# Emprego Agro Paraná — Emprego Formal no Agronegócio

Dashboard de emprego formal no agronegócio paranaense (2020–2025), com dados do RAIS/CAGED (MTE). Organizado em 7 abas temáticas — de visão geral a perfil do trabalhador e salários — com filtros regionais e cross-filtering por clique nos gráficos.

**🔗 [Acessar dashboard](https://avnergomes.github.io/emprego-agro-parana/)**

Parte do ecossistema **[Datageo Paraná](https://datageoparana.github.io)**.

## Sobre

O mercado formal de trabalho no agronegócio paranaense envolve centenas de milhares de trabalhadores distribuídos por cadeias produtivas, classes CNAE e municípios de todo o estado. Este dashboard consolida os microdados do RAIS e do CAGED (Ministério do Trabalho e Emprego) para o período 2020–2025, permitindo análises detalhadas de admissões, demissões, saldo de empregos e salários.

A arquitetura de dados utiliza um cubo granular (`granular_cube.json`) que habilita o cross-filtering interativo: clicar em um gráfico filtra automaticamente os demais painéis da mesma aba. As 7 abas cobrem desde a visão geral até recortes específicos por cadeia produtiva, CNAE, perfil demográfico do trabalhador, salários, distribuição geográfica e evolução temporal.

O mapa SVG do Paraná (`mun_PR.json`) e o bump chart de ranking completam a análise territorial e competitiva entre municípios e regiões.

## Fonte de Dados

- **RAIS/CAGED — MTE** — Relação Anual de Informações Sociais e Cadastro Geral de Empregados e Desempregados, Ministério do Trabalho e Emprego
- Período: 2020–2025
- Atualização: workflow automatizado (`data-pipeline.yml`)

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| Gráficos | Recharts, D3.js |
| Mapas | react-simple-maps (SVG) |
| Pipeline | Python (Pandas) |
| Deploy | GitHub Pages via GitHub Actions |
| Tracking | LGPD-compliant (19 métricas anônimas) |

## Estrutura do Projeto

```
emprego-agro-parana/
├── dashboard/          # Aplicação React
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/ # 16 componentes
│   ├── public/
│   │   ├── data/       # JSONs processados
│   │   └── assets/     # mun_PR.json (mapa SVG)
│   └── index.html
├── scripts/            # Pipeline de dados (Python)
│   ├── download_caged.py
│   ├── download_caged_ftp.py
│   ├── download_caged_granular.py
│   ├── download_sidra.py
│   ├── cnae_cadeias.py
│   ├── prepare_dashboard_data.py
│   └── prepare_dashboard_granular.py
├── .github/workflows/  # CI/CD
│   ├── data-pipeline.yml
│   └── deploy.yml
└── README.md
```

## Funcionalidades

- 7 abas temáticas: Visão Geral, Cadeias Produtivas, CNAE, Perfil do Trabalhador, Salários, Municípios e Evolução Temporal
- Filtros regionais por mesorregião, regional IDR e município
- Cross-filtering interativo: clique em qualquer gráfico filtra os demais painéis
- Cubo granular para análises multidimensionais
- Mapa SVG do Paraná por município
- Bump chart de ranking de municípios/regiões
- Circular bar chart para comparações periódicas
- KPIs de admissões, demissões, saldo e salário médio

## Desenvolvimento Local

```bash
# Clone
git clone https://github.com/avnergomes/emprego-agro-parana.git
cd emprego-agro-parana/dashboard

# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build
```

## Pipeline de Dados

O pipeline em `scripts/` coleta os microdados do CAGED via `download_caged.py`, `download_caged_ftp.py` e `download_caged_granular.py`, e dados complementares via `download_sidra.py`. O script `cnae_cadeias.py` realiza o mapeamento de classes CNAE para cadeias produtivas do agronegócio. Os scripts `prepare_dashboard_data.py` e `prepare_dashboard_granular.py` geram os arquivos finais em `dashboard/public/data/` (`aggregated_full.json`, `granular_cube.json`, `granular_dimensions.json`). O workflow `data-pipeline.yml` automatiza todo o processo no GitHub Actions.

## Licença

Dados públicos. Dashboard desenvolvido por [Avner Gomes](https://avnergomes.github.io/portfolio/).
