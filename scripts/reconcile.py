"""
Reconciliação por ano entre a versão publicada antiga (v1, aggregated_full.json no HEAD do git)
e a nova (fato v2) -> docs/RECONCILIACAO.md.

Decompõe a diferença em: remoção do drop_duplicates (MOV sem deduplicação), ajustes FOR
(declarações fora do prazo) e EXC (exclusões). A taxonomia de cadeias não altera totais.

Uso: python scripts/reconcile.py
"""

import datetime as dt
import json
import os
import subprocess
import sys

import pandas as pd

from build_fact import FACT_PATH

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(SCRIPT_DIR, '..'))
SAIDA = os.path.join(RAIZ, 'docs', 'RECONCILIACAO.md')
V1_GIT = 'HEAD:dashboard/public/data/aggregated_full.json'
# colunas do fato usadas para imitar o drop_duplicates da v1 (que também usava horascontratuais,
# ausente no fato; por isso a reprodução é aproximada)
COLS_DEDUP = ['competencia', 'mov', 'municipio', 'subclasse', 'sexo', 'idade', 'escolaridade', 'porte',
              'raca_cor', 'tipo_mov', 'salario', 'intermitente', 'parcial', 'aprendiz', 'cbo']


def ler_v1():
    try:
        bruto = subprocess.run(['git', '-c', 'safe.directory=*', 'show', V1_GIT], cwd=RAIZ,
                               capture_output=True, check=True).stdout
    except subprocess.CalledProcessError:
        return None
    anos = json.loads(bruto.decode('utf-8'))['yearly']
    return pd.DataFrame(anos).set_index('ano')[['admissoes', 'demissoes', 'saldo']]


def anual(df, peso='w'):
    ano = df['competencia'].str[:4].astype(int)
    adm = df[peso].where(df['mov'] == 1, 0).groupby(ano).sum()
    des = df[peso].where(df['mov'] == -1, 0).groupby(ano).sum()
    return pd.DataFrame({'admissoes': adm, 'demissoes': des, 'saldo': adm - des})


def pct(a, b):
    return '—' if not b else f'{(a - b) / abs(b) * 100:+.2f}%'


def montar(fato, v1):
    mov = fato[fato['fonte'] == 'MOV']
    partes = {
        'mov_dedup': anual(mov.drop_duplicates(COLS_DEDUP)),
        'mov': anual(mov),
        'for': anual(fato[fato['fonte'] == 'FOR']),
        'exc': anual(fato[fato['fonte'] == 'EXC']),
        'nova': anual(fato),
    }
    anos = sorted(set(partes['nova'].index) | set(v1.index if v1 is not None else []))
    linhas = [
        f'# Reconciliação v1 × v2 (seção A, Paraná)',
        '',
        f'Gerado por `scripts/reconcile.py` em {dt.date.today().isoformat()}. '
        f'Fato: {len(fato):,} registros; último mês de divulgação: {fato["decl"].max()}.',
        '',
        '**v1** = `yearly` do `aggregated_full.json` publicado (HEAD). **v2** = fato novo, série por '
        'competência com ajustes (MOV + FOR − EXC), sem `drop_duplicates`.',
        '',
    ]
    for med, rot in [('admissoes', 'Admissões'), ('demissoes', 'Desligamentos'), ('saldo', 'Saldo')]:
        linhas += [f'## {rot}', '',
                   '| Ano | v1 | v2 | v2 − v1 | % | MOV dedup (≈v1) | MOV sem dedup | + FOR | EXC (Σw) |',
                   '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
        for a in anos:
            g = lambda k: int(partes[k][med].get(a, 0))  # noqa: E731
            antigo = int(v1[med].get(a, 0)) if v1 is not None else 0
            linhas.append(f'| {a} | {antigo:,} | {g("nova"):,} | {g("nova") - antigo:+,} | '
                          f'{pct(g("nova"), antigo)} | {g("mov_dedup"):,} | {g("mov"):,} | {g("for"):+,} | '
                          f'{g("exc"):+,} |')
        linhas.append('')
    linhas += [
        '## Explicação das diferenças',
        '',
        '1. **Remoção do `drop_duplicates`.** A v1 deduplicava os registros do MOV. Como os microdados '
        'não têm identificador de vínculo, registros idênticos são movimentos distintos e a deduplicação '
        'subcontava admissões e desligamentos. Diferença: coluna "MOV sem dedup" − "MOV dedup". A '
        'reprodução da v1 é aproximada, porque a v1 também deduplicava por `horascontratuais`, que não está no fato.',
        '2. **FOR (declarações fora do prazo).** Entram na competência do movimento (`competênciamov`), '
        'como na série com ajustes do MTE. A v1 só lia o MOV.',
        '3. **EXC (exclusões).** Subtraídas na competência do movimento excluído, com o sinal original '
        'de `saldomovimentação` (peso w = −1). A v1 não as aplicava.',
        '4. **Taxonomia de cadeias.** Todas as 122 subclasses da seção A têm cadeia; a taxonomia muda só '
        'a distribuição entre cadeias, não os totais.',
        '5. **Competências anteriores a 2020-01** que aparecem em FOR/EXC são descartadas (a série começa em 2020-01).',
        '6. **Versão dos arquivos-fonte.** Em vários meses a v1 tem menos registros que o MOV atual '
        'deduplicado (coluna "MOV dedup (≈v1)"). A v1 baixava só períodos faltantes e nunca '
        'reprocessava os já carregados; os arquivos do FTP foram regravados pelo MTE em 06/2026 '
        '(LIST: CAGEDMOV202002.7z em 06-08-26, CAGEDMOV202401.7z em 06-12-26). '
        'Verificação em 2020-02: os microdados da v1 tinham 4.123 registros PR/seção A; o mesmo filtro da '
        'v1 aplicado ao CAGEDMOV202002.7z atual do FTP dá 5.864 (5.607 após deduplicar). O resíduo '
        '"v1 − MOV dedup" vem portanto de arquivos-fonte desatualizados na v1, não de regra metodológica.',
        '',
    ]
    if v1 is None:
        linhas.insert(4, f'> v1 não encontrada em `{V1_GIT}`; colunas v1 zeradas.\n')
    return '\n'.join(linhas)


def main():
    v1 = ler_v1()
    if v1 is None and os.path.exists(SAIDA):
        # depois que a v1 sai do HEAD (CI pós-migração), mantém a reconciliação já gerada
        print(f'v1 ausente em {V1_GIT}; {SAIDA} mantido')
        return 0
    texto = montar(pd.read_parquet(FACT_PATH), v1)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as f:
        f.write(texto)
    print(texto)
    return 0


if __name__ == '__main__':
    sys.exit(main())
