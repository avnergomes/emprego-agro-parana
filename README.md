# Emprego Agrícola - Paraná

Dashboard interativo de emprego formal na agropecuária paranaense.

## Sobre

Este dashboard apresenta dados de movimentação de emprego formal (admissões e demissões) no setor agropecuário do Paraná, baseado em estatísticas do CAGED/MTE.

### Cobertura

- **Estado:** Paraná (PR)
- **Período:** 2020-2025
- **Setores:** CNAE Seção A (Agricultura, Pecuária, Silvicultura, Pesca)

### Visualizações

- **Visão Geral:** KPIs, série temporal, distribuição por setor
- **Por Setor:** Comparativo entre divisões CNAE
- **Sazonalidade:** Padrão mensal de contratações
- **Evolução Anual:** Resumo e tendências por ano

## Stack Tecnológico

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3
- **Gráficos:** Recharts
- **Ícones:** Lucide React
- **ETL:** Python + Pandas

## Desenvolvimento

```bash
# Instalar dependências
cd dashboard
npm install

# Rodar em desenvolvimento
npm run dev

# Build para produção
npm run build
```

## Scripts Python

```bash
# Download de dados
python scripts/download_sidra.py

# Processamento para dashboard
python scripts/prepare_dashboard_data.py
```

## Estrutura

```
emprego-agro-parana/
├── dashboard/           # Frontend React
│   ├── src/
│   │   ├── App.jsx     # Componente principal
│   │   └── index.css   # Estilos Tailwind
│   └── public/data/    # JSONs do dashboard
├── scripts/            # Scripts Python
│   ├── download_sidra.py
│   └── prepare_dashboard_data.py
└── data/               # Dados brutos e processados
    ├── raw/
    └── processed/
```

## Fonte dos Dados

- **CAGED/MTE:** Cadastro Geral de Empregados e Desempregados
- **SIDRA/IBGE:** Sistema IBGE de Recuperação Automática

> **Nota:** Os dados atuais são simulados com base em estatísticas reais do Paraná. Para dados oficiais, consulte o [PDET/MTE](http://pdet.mte.gov.br/).

## Parte do Ecossistema DataGeo Paraná

- [Portal DataGeo](https://datageoparana.github.io)
- [VBP Paraná](https://avnergomes.github.io/vbp-parana/)
- [Preços Florestais](https://avnergomes.github.io/precos-florestais/)
- [Preços de Terras](https://avnergomes.github.io/precos-de-terras/)
- [Preços Diários](https://avnergomes.github.io/precos-diarios/)
- [ComexStat Paraná](https://avnergomes.github.io/comexstat-parana/)

---

*DataGeo Paraná © 2026*
