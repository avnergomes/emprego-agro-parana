# Reconciliação v1 × v2 (seção A, Paraná)

Gerado por `scripts/reconcile.py` em 2026-10-11. Fato: 717,527 registros; último mês de divulgação: 202608.

**v1** = `yearly` do `aggregated_full.json` publicado (HEAD). **v2** = fato novo, série por competência com ajustes (MOV + FOR − EXC), sem `drop_duplicates`.

## Admissões

| Ano | v1 | v2 | v2 − v1 | % | MOV dedup (≈v1) | MOV sem dedup | + FOR | EXC (Σw) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 23,481 | 34,398 | +10,917 | +46.49% | 28,877 | 30,243 | +4,290 | -135 |
| 2021 | 41,567 | 54,454 | +12,887 | +31.00% | 45,945 | 48,278 | +6,312 | -136 |
| 2022 | 51,820 | 57,537 | +5,717 | +11.03% | 53,863 | 56,687 | +915 | -65 |
| 2023 | 56,087 | 59,535 | +3,448 | +6.15% | 56,081 | 58,848 | +770 | -83 |
| 2024 | 56,379 | 59,192 | +2,813 | +4.99% | 56,364 | 58,553 | +691 | -52 |
| 2025 | 57,827 | 60,504 | +2,677 | +4.63% | 57,825 | 59,786 | +760 | -42 |
| 2026 | 38,368 | 40,252 | +1,884 | +4.91% | 38,359 | 39,811 | +454 | -13 |

## Desligamentos

| Ano | v1 | v2 | v2 − v1 | % | MOV dedup (≈v1) | MOV sem dedup | + FOR | EXC (Σw) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 22,105 | 31,375 | +9,270 | +41.94% | 26,568 | 26,972 | +4,456 | -53 |
| 2021 | 38,736 | 48,044 | +9,308 | +24.03% | 42,076 | 42,837 | +5,292 | -85 |
| 2022 | 51,828 | 55,390 | +3,562 | +6.87% | 53,731 | 54,608 | +831 | -49 |
| 2023 | 54,710 | 56,147 | +1,437 | +2.63% | 54,702 | 55,675 | +570 | -98 |
| 2024 | 57,702 | 58,971 | +1,269 | +2.20% | 57,694 | 58,511 | +521 | -61 |
| 2025 | 57,176 | 58,547 | +1,371 | +2.40% | 57,175 | 57,975 | +643 | -71 |
| 2026 | 40,293 | 41,243 | +950 | +2.36% | 40,290 | 40,923 | +346 | -26 |

## Saldo

| Ano | v1 | v2 | v2 − v1 | % | MOV dedup (≈v1) | MOV sem dedup | + FOR | EXC (Σw) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2020 | 1,376 | 3,023 | +1,647 | +119.69% | 2,309 | 3,271 | -166 | -82 |
| 2021 | 2,831 | 6,410 | +3,579 | +126.42% | 3,869 | 5,441 | +1,020 | -51 |
| 2022 | -8 | 2,147 | +2,155 | +26937.50% | 132 | 2,079 | +84 | -16 |
| 2023 | 1,377 | 3,388 | +2,011 | +146.04% | 1,379 | 3,173 | +200 | +15 |
| 2024 | -1,323 | 221 | +1,544 | +116.70% | -1,330 | 42 | +170 | +9 |
| 2025 | 651 | 1,957 | +1,306 | +200.61% | 650 | 1,811 | +117 | +29 |
| 2026 | -1,925 | -991 | +934 | +48.52% | -1,931 | -1,112 | +108 | +13 |

## Explicação das diferenças

1. **Remoção do `drop_duplicates`.** A v1 deduplicava os registros do MOV. Como os microdados não têm identificador de vínculo, registros idênticos são movimentos distintos e a deduplicação subcontava admissões e desligamentos. Diferença: coluna "MOV sem dedup" − "MOV dedup". A reprodução da v1 é aproximada, porque a v1 também deduplicava por `horascontratuais`, que não está no fato.
2. **FOR (declarações fora do prazo).** Entram na competência do movimento (`competênciamov`), como na série com ajustes do MTE. A v1 só lia o MOV.
3. **EXC (exclusões).** Subtraídas na competência do movimento excluído, com o sinal original de `saldomovimentação` (peso w = −1). A v1 não as aplicava.
4. **Taxonomia de cadeias.** Todas as 122 subclasses da seção A têm cadeia; a taxonomia muda só a distribuição entre cadeias, não os totais.
5. **Competências anteriores a 2020-01** que aparecem em FOR/EXC são descartadas (a série começa em 2020-01).
6. **Versão dos arquivos-fonte.** Em vários meses a v1 tem menos registros que o MOV atual deduplicado (coluna "MOV dedup (≈v1)"). A v1 baixava só períodos faltantes e nunca reprocessava os já carregados; os arquivos do FTP foram regravados pelo MTE em 06/2026 (LIST: CAGEDMOV202002.7z em 06-08-26, CAGEDMOV202401.7z em 06-12-26). Verificação em 2020-02: os microdados da v1 tinham 4.123 registros PR/seção A; o mesmo filtro da v1 aplicado ao CAGEDMOV202002.7z atual do FTP dá 5.864 (5.607 após deduplicar). O resíduo "v1 − MOV dedup" vem portanto de arquivos-fonte desatualizados na v1, não de regra metodológica.
