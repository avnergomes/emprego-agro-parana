# Contrato de dados: pipeline ↔ dashboard

Fonte única de verdade para a versão 2 dos dados. Pipeline (Python) e dashboard (React) seguem este documento; testes verificam os dois lados.

## 1. Metodologia (Novo CAGED, validada contra números oficiais do MTE)

- Recorte: `uf == 41` e `seção == 'A'` (divisões CNAE 01, 02, 03).
- Arquivos por mês de divulgação `d`: `CAGEDMOV{d}` (obrigatório), `CAGEDFOR{d}` e `CAGEDEXC{d}` (opcionais: FOR existe a partir de 2020-02 e EXC a partir de 2020-04; ausência no FTP não é erro).
- Série por competência (com ajustes): para cada registro, a competência é `competênciamov`. Peso `w = +1` para MOV e FOR, `w = -1` para EXC. O `saldomovimentação` mantém o sinal original também no EXC.
  - admissões(M) = Σ w sobre registros com saldomovimentação = +1 e competênciamov = M
  - desligamentos(M) = Σ w sobre registros com saldomovimentação = −1 e competênciamov = M
  - saldo = admissões − desligamentos
- Sem `drop_duplicates`: não há ID de vínculo; registros idênticos são movimentos distintos.
- Salário (regra oficial do MTE para salário médio de admissão): só admissões, excluindo `indtrabintermitente == 1`, mantendo `0,3·SM ≤ salário ≤ 150·SM`, com o salário mínimo vigente na competência. Coluna `salário` (vírgula decimal). Valores nominais (sem deflação).
  - SM por vigência: 2020-01: 1039; 2020-02: 1045; 2021: 1100; 2022: 1212; 2023-01: 1302; 2023-05: 1320; 2024: 1412; 2025: 1518; 2026: 1621.
- Idade média: média de `idade` sobre admissões com idade válida (14 a 99).
- Dicionários oficiais (layout MTE): ver `scripts/cnae_cadeias.py` (sexo 1/3/9, raçacor 1 Branca…5 Indígena, graudeinstrução, tamestabjan com 90/97/98/99 → "Não informado", tipomovimentação oficial).
- Faixa etária: Menor de 18 (<18), 18 a 24, 25 a 29, 30 a 39, 40 a 49, 50 a 64, 65 anos ou mais, Não informado.
- Faixas salariais (`sbin`), limites em R$ (inferior inclusivo): 0 = fora da regra salarial (desligamento, intermitente, fora de 0,3–150 SM ou ausente); 1..N para os intervalos de `SAL_EDGES = [0, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2200, 2400, 2600, 2800, 3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000, 25000, 50000, 250000]` (bin i cobre [E[i-1], E[i]); o último bin é aberto à direita). Percentis são estimados por interpolação linear dentro do bin e rotulados "estimado".

## 2. Fato (pipeline, `data/fact/caged_agro_pr.parquet`, versionado)

Uma linha por registro dos arquivos MOV/FOR/EXC filtrados. Colunas:
`fonte` (MOV|FOR|EXC), `decl` (AAAAMM do arquivo de divulgação), `competencia` (AAAA-MM, de competênciamov), `w` (+1/−1), `mov` (1 = admissão, −1 = desligamento), `municipio` (6 dígitos), `subclasse` (7 dígitos), `sexo`, `idade`, `escolaridade`, `porte`, `raca_cor`, `tipo_mov`, `salario`, `intermitente`, `parcial`, `aprendiz`, `cbo`.
Códigos numéricos oficiais; nomes resolvidos na etapa de build.

Manifesto `data/fact/manifest.json`: `{ "CAGEDMOV202001.7z": {"size": n, "date": "MM-DD-YY HH:MMAM"}, ... }`. Execução incremental: lista o FTP, baixa só arquivos novos ou cujo size/date mudou, substitui no fato todas as linhas daquele arquivo (`fonte`+`decl`) e grava o manifesto. Lacuna de MOV em qualquer mês entre 2020-01 e o último mês publicado = falha (exit 1). A descoberta do último mês é feita listando o FTP, sem folga fixa.

## 3. Dimensões (`dashboard/public/data/v2/dims.json`)

Dicionários compartilhados, índices estáveis dentro de uma versão:
```json
{
  "version": "AAAA-MM-DD",
  "periodos": ["2020-01", ...],
  "municipios": [{"cod": "410010", "nome": "Abatiá", "reg": "Cornélio Procópio", "meso": "Norte"}, ...],
  "regionais": [{"nome": "Cornélio Procópio", "slug": "cornelio-procopio", "meso": "Norte", "file": "cornelio-procopio.json", "bytes": n}, ...],
  "mesos": ["Centro", ...],
  "cadeias": [{"nome": "Grãos", "cor": "#hex", "descricao": "..."}, ...],
  "subclasses": [{"cod": "0111301", "descricao": "Cultivo de arroz", "cadeia": 0}, ...],
  "sexo": ["Masculino", "Feminino", "Não informado"],
  "faixa": ["Menor de 18", "18 a 24 anos", "25 a 29 anos", "30 a 39 anos", "40 a 49 anos", "50 a 64 anos", "65 anos ou mais", "Não informado"],
  "escolaridade": [...13 valores oficiais + "Não informado"...],
  "porte": ["Zero", "De 1 a 4", ..., "1000 ou mais", "Não informado"],
  "sal_edges": [...SAL_EDGES...],
  "porte_indisponivel": ["2026-08"]
}
```
`porte_indisponivel`: competências em que o MTE não preencheu o porte (`tamestabjan`): mais de 95% das movimentações (Σ|n|) caem em "Não informado". Calculado pelo `build_cube.py` a cada execução.

O mapeamento município → regional IDR → mesorregião vem de `scripts/regionais_pr.json` (versionado no repositório, extraído uma vez do TopoJSON do Datageo; 399 municípios; nomes na grafia oficial do IBGE, com correção pontual em `build_regionais.py` onde o TopoJSON diverge, ex.: 411680 Nova Cantu). O pipeline não depende de repositório irmão.

## 4. Cubo particionado (`dashboard/public/data/v2/cubo/{slug}.json`, um por regional IDR)

Grão: (municipio, subclasse, periodo, mov, sexo, faixa, escolaridade, porte, sbin). Formato colunar, índices em `dims.json`:
```json
{ "version": "AAAA-MM-DD", "n_rows": k, "mun": [...], "sub": [...], "per": [...], "mov": [1,-1,...], "sexo": [...], "faixa": [...], "esc": [...], "porte": [...], "sbin": [...],
  "n": [...],        // Σ w (pode ser negativo por ajuste EXC)
  "sal": [...],      // Σ w·salário (R$, 2 casas) nas linhas com sbin > 0; 0 nas demais
  "idade": [...] }   // Σ w·idade nas admissões com idade válida; 0 nas demais
```
`version` = `dims.version` do mesmo build. `decodePartitions` recusa partição de outra versão ou com índice `per`/`mun`/`sub` fora de `dims` (aba aberta antes de um deploy, cache HTTP): erro pedindo para recarregar a página, nunca números misturados.
Medidas derivadas: n_sal = Σ n onde sbin > 0; n_idade = Σ n onde mov = 1 e faixa ≠ "Não informado".
Linhas com n = 0 e sal = 0 e idade = 0 são omitidas.

## 5. Agregado inicial (`dashboard/public/data/v2/agregado.json`)

Exatamente a saída do motor (seção 6) aplicado a todo o cubo sem filtros, gerado pelo Python. O teste de consistência exige igualdade com o motor JS.

## 6. Motor de agregação (`dashboard/src/engine/`) e semântica de filtros

Estado de filtros (todos opcionais, valor único por dimensão, clique alterna):
`meso`, `reg`, `mun` (hierárquicos: mun > reg > meso), `cadeia`, `cnae` (subclasse), `ano` (AAAA) ou `periodo` (AAAA-MM, exclusivos), `sexo`, `faixa`, `escolaridade`, `porte`.

Semântica de cross-filter: **cada gráfico aplica todos os filtros, exceto o da sua própria dimensão** (que vira destaque). Totais e KPIs aplicam todos.
| Saída | Filtros ignorados (viram destaque) |
|---|---|
| kpis, salário, perfil | nenhum |
| byCadeia, salaryDistribution (por cadeia) | cadeia, cnae |
| crossCadeiaSexo | cadeia, cnae, sexo |
| byCnae | cnae |
| bySexo | sexo |
| byFaixaEtaria | faixa |
| byEscolaridade | escolaridade |
| byPorte | porte |
| byMunicipio, topMunicipios | mun |
| timeseries, yearly, seasonality, timeseriesCadeia | ano, periodo |

Implementação: uma passada sobre as linhas; para cada linha calcula-se a máscara de bits dos filtros em que ela falha; a linha contribui para uma saída se `(falhas & ~ignorados_da_saida) == 0`. Linhas que falham em filtros não ignorados por nenhuma saída são descartadas cedo.

Detalhes obrigatórios:
- Filtro `mun` em `byMunicipio`/`topMunicipios`: ignora `mun`, mas aplica implicitamente `reg = reg(mun)` (mostra a regional do município, com ele destacado), nunca o estado inteiro.
- Porte indisponível: com filtro `porte` ativo, as competências de `dims.porte_indisponivel` saem do recorte de **todas** as saídas (como se não existissem): não entram em KPIs, `timeseries` (a linha do período é omitida), `yearly`, `seasonality` (nem no nº de anos do mês) e listas; `periodo_referencia`/`ultimo_mes` passam a ser o último período disponível. Filtro `periodo` explícito prevalece. Sem filtro de porte nada muda (`byPorte` mostra a competência toda em "Não informado", com nota na UI).
- Percentis: bins com contagem negativa (ajuste EXC) são truncados em 0 antes da interpolação. Percentil p: acumula contagens dos bins até alcançar p·N; interpola linearmente dentro do bin [E[i-1], E[i]); no último bin usa E[i-1] (sem extrapolar).
- `dims.municipios` lista os 399 municípios do PR (inclusive os sem movimentação, ex.: 411570), para o mapa.
- Rodapé/header: "movimentações" = admissões + desligamentos do recorte (com ajustes). Nota: "Série por competência com ajustes (declarações fora do prazo e exclusões), metodologia do Novo CAGED/MTE."

## 6.1 API do motor (JS, ES modules, sem dependências)

```js
// dashboard/src/engine/index.js
export const FILTER_KEYS = ['meso','reg','mun','cadeia','cnae','ano','periodo','sexo','faixa','escolaridade','porte']
export function requiredPartitions(dims, filters) // -> string[] de nomes de arquivo de cubo (regionais)
export function decodePartitions(dims, jsonArray) // -> cubo colunar (TypedArrays) concatenado
export function aggregate(cube, dims, filters)    // -> objeto com todas as saídas da seção 6
export function isEmptyFilters(filters)
```
`filters` usa os rótulos exibidos (strings) para dimensões categóricas e códigos para `mun`/`cnae`; `ano` é 'AAAA', `periodo` 'AAAA-MM'. O motor é puro (sem fetch); a carga com cache fica em `dashboard/src/engine/loader.js` (`createLoader(baseUrl, fetchFn)` → `{ loadDims(), loadAgregado(), loadCube(files) }`).

## 7. Taxonomia de cadeias (subclasse CNAE 2.3 → cadeia)

Toda subclasse das divisões 01–03 (122, tabela IBGE/CONCLA) tem exatamente uma cadeia; teste exige cobertura total e chaves únicas.
- Grãos: 0111301 arroz, 0111302 milho, 0111303 trigo, 0111399 outros cereais, 0119905 feijão
- Sojicultura: 0115600
- Algodão e Fibras: 01121xx (0112101, 0112102, 0112199)
- Cana-de-açúcar: 0113000
- Fumo: 0114800
- Outras Lavouras Temporárias: 0116401–0116499 (oleaginosas), 0119906 mandioca, 0119999
- Horticultura: 0121101, 0121102, 0122900, 0119902 alho, 0119903 batata-inglesa, 0119904 cebola, 0119907 melão, 0119908 melancia, 0119909 tomate rasteiro
- Fruticultura: 0131800, 0132600, 0133401–0133499, 0119901 abacaxi
- Cafeicultura: 0134200
- Outras Lavouras Permanentes: 0135100 cacau, 0139301–0139399 (erva-mate etc.)
- Sementes e Mudas: 0141501, 0141502, 0142300
- Bovinocultura de Corte: 0151201
- Bovinocultura de Leite: 0151202
- Ovinocaprinocultura: 0153901, 0153902
- Suinocultura: 0154700
- Avicultura: 0155501–0155505
- Apicultura: 0159801
- Outras Criações: 0151203, 0152101, 0152102, 0152103, 0159802, 0159803, 0159804, 0159899, 0170900
- Serviços Agrícolas: 0161001, 0161002, 0161003, 0161099, 0163600
- Serviços à Pecuária: 0162801, 0162802, 0162803, 0162899
- Silvicultura: 0210101–0210199, 0230600
- Extrativismo Florestal: 0220901–0220999
- Pesca: 0311601–0312499 (grupos 031x)
- Aquicultura: 0321301–0322199 (grupos 032x)
Se a tabela oficial trouxer subclasse não listada aqui, ela entra pela regra do grupo (prefixo de 4 dígitos) acima; o teste falha se sobrar alguma sem cadeia.

Saídas (mesmos nomes de campos do `aggregated_full.json` v1, números como `number`, nunca string):
- `kpis`: `{ periodo_referencia, ultimo_mes{admissoes,demissoes,saldo}, acumulado{admissoes,demissoes,saldo}, salario{media, mediana, n}, perfil{pct_masculino, idade_media} }`. `pct_masculino` = admissões masculinas / admissões com sexo informado × 100. `ultimo_mes` = último período do recorte.
- `timeseries[]`: periodo, admissoes, demissoes, saldo, saldo_acumulado, salario_medio, salario_mediana, n_sal.
- `yearly[]`: ano, admissoes, demissoes, saldo, salario_medio, n_sal.
- `seasonality[]` (12): mes, mes_nome, admissoes, demissoes, saldo (médias mensais = soma / nº de anos com aquele mês no recorte), indice = admissões médias do mês / média das 12 × 100.
- `byCadeia[]`: cadeia, cor, descricao, admissoes, demissoes, saldo, salario_medio, salario_mediana, n_sal, n_subclasses, n_municipios, pct_admissoes (ordenado por admissões desc).
- `byCnae[]`: cnae, descricao, cadeia, admissoes, demissoes, saldo, salario_medio, salario_mediana, n_sal, n_municipios.
- `byMunicipio[]`: codigo, nome, reg, meso, admissoes, demissoes, saldo, salario_medio, n_sal, cadeia_dominante (argmax de admissões).
- `topMunicipios[]`: top 20 de byMunicipio por admissões.
- `bySexo[]`, `byFaixaEtaria[]`, `byEscolaridade[]`, `byPorte[]`: [dim], admissoes, demissoes, saldo, salario_medio, salario_mediana, n_sal, pct (participação nas admissões).
- `crossCadeiaSexo[]`: cadeia, sexo, admissoes, demissoes, saldo, salario_medio, n_sal.
- `timeseriesCadeia[]`: periodo, cadeia, admissoes, demissoes, saldo.
- `salaryDistribution[]` (por cadeia): cadeia, p10, p25, p50, p75, p90, mean, n_sal (percentis estimados por bins).

LGPD: qualquer salário (média, mediana, percentil) com `n_sal < 5` é renderizado como `null` nas saídas do motor (inclusive `agregado.json`) e na UI, exibido como "—" ("amostra insuficiente"). A supressão é regra de exibição: os arquivos `v2/cubo/*.json` contêm células com n pequeno (inclusive n=1) e somas de salário e idade, que reproduzem com menos detalhe (sem CBO nem raça, idade em faixa) o microdado público e desidentificado do MTE; nenhum identificador é publicado.

Carga no navegador: sem filtros, `agregado.json`. Com filtro regional, só os arquivos das regionais envolvidas. Com qualquer outro filtro e sem filtro regional, todas as regionais (paralelo, cache). Enquanto carrega, a UI mostra estado de carregamento e nunca exibe números de um recorte anterior rotulados como o novo.
