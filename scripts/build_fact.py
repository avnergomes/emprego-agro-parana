"""
Constrói o fato data/fact/caged_agro_pr.parquet (contrato §2) a partir dos arquivos
CAGEDMOV/FOR/EXC do FTP do MTE.

- Recorte: uf == 41 e seção == 'A'. Sem drop_duplicates (registros idênticos são movimentos distintos).
- Incremental: compara a listagem do FTP com data/fact/manifest.json e só (re)processa
  arquivos novos ou com size/date diferentes, substituindo as linhas daquele (fonte, decl).
- Falha (exit 1) se faltar CAGEDMOV de qualquer mês entre 2020-01 e o último publicado.
- Leitura em streaming (pyarrow, blocos de 64 MB): o MOV tem ~4,4 milhões de linhas.

Uso:
  python scripts/build_fact.py            # lista o FTP, baixa o que falta, processa
  python scripts/build_fact.py --offline  # usa só os .7z já presentes no cache
  python scripts/build_fact.py --force    # reprocessa tudo
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.csv as pacsv

import caged_ftp

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FACT_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'fact')
FACT_PATH = os.path.join(FACT_DIR, 'caged_agro_pr.parquet')
MANIFEST_PATH = os.path.join(FACT_DIR, 'manifest.json')
SEVEN_ZIP = shutil.which('7z') or r'C:\Program Files\7-Zip\7z.exe'

PRIMEIRO_MES = '202001'
GRAVAR_A_CADA = 10  # arquivos processados entre gravações intermediárias do fato

# coluna do CSV -> coluna do fato
COLUNAS = {
    'competênciamov': 'competencia',
    'município': 'municipio',
    'subclasse': 'subclasse',
    'saldomovimentação': 'mov',
    'sexo': 'sexo',
    'idade': 'idade',
    'graudeinstrução': 'escolaridade',
    'tamestabjan': 'porte',
    'raçacor': 'raca_cor',
    'tipomovimentação': 'tipo_mov',
    'salário': 'salario',
    'indtrabintermitente': 'intermitente',
    'indtrabparcial': 'parcial',
    'indicadoraprendiz': 'aprendiz',
    'cbo2002ocupação': 'cbo',
}
FILTRO = ['uf', 'seção']
ORDEM = ['fonte', 'decl', 'competencia', 'w', 'mov', 'municipio', 'subclasse', 'sexo', 'idade',
         'escolaridade', 'porte', 'raca_cor', 'tipo_mov', 'salario', 'intermitente', 'parcial',
         'aprendiz', 'cbo']
INT16 = ['sexo', 'idade', 'escolaridade', 'porte', 'raca_cor', 'tipo_mov']
INT8 = ['intermitente', 'parcial', 'aprendiz']


# ---------------------------------------------------------------------------
# Leitura de um arquivo
# ---------------------------------------------------------------------------

def ler_csv_filtrado(caminho_txt):
    """Lê o CSV do CAGED em blocos e devolve só PR (uf 41) e seção A, tudo como texto."""
    cols = FILTRO + list(COLUNAS)
    leitor = pacsv.open_csv(
        caminho_txt,
        read_options=pacsv.ReadOptions(block_size=64 << 20, encoding='utf8'),
        parse_options=pacsv.ParseOptions(delimiter=';'),
        convert_options=pacsv.ConvertOptions(include_columns=cols,
                                             column_types={c: pa.string() for c in cols}),
    )
    partes = []
    for lote in leitor:
        m = pc.and_(pc.equal(lote['uf'], '41'), pc.equal(lote['seção'], 'A'))
        partes.append(lote.filter(m))
    return pa.Table.from_batches(partes, schema=leitor.schema).drop_columns(FILTRO).to_pandas()


def normalizar(bruto, fonte, decl):
    """Texto do CSV -> schema do fato (contrato §2)."""
    df = bruto.rename(columns=COLUNAS)
    num = lambda c: pd.to_numeric(df[c].str.strip(), errors='coerce')  # noqa: E731
    out = pd.DataFrame({
        'fonte': fonte,
        'decl': decl,
        'competencia': df['competencia'].str[:4] + '-' + df['competencia'].str[4:6],
        'w': -1 if fonte == 'EXC' else 1,
        'mov': num('mov'),
        'municipio': df['municipio'].str.strip().str.zfill(6),
        'subclasse': df['subclasse'].str.strip().str.zfill(7),
        'salario': pd.to_numeric(df['salario'].str.strip().str.replace(',', '.', regex=False),
                                 errors='coerce'),
        'cbo': df['cbo'].str.strip(),
    }, index=df.index)
    for c in INT16:
        out[c] = num(c).astype('Int16')
    for c in INT8:
        out[c] = num(c).astype('Int8')
    if not out['mov'].isin([1, -1]).all():
        raise ValueError(f'{fonte}{decl}: saldomovimentação fora de {{1,-1}}')
    out['mov'] = out['mov'].astype('int8')
    out['w'] = out['w'].astype('int8')
    return out[ORDEM].reset_index(drop=True)


def extrair(arquivo_7z, destino):
    """Extrai o .7z (py7zr; se o módulo faltar, 7z.exe) e devolve o caminho do .txt."""
    try:
        import py7zr
        with py7zr.SevenZipFile(arquivo_7z, mode='r') as z:
            z.extractall(path=destino)
    except ImportError:
        subprocess.run([SEVEN_ZIP, 'e', '-y', f'-o{destino}', arquivo_7z],
                       check=True, stdout=subprocess.DEVNULL)
    txts = [f for f in os.listdir(destino) if f.lower().endswith('.txt')]
    if len(txts) != 1:
        raise RuntimeError(f'{arquivo_7z}: esperado 1 .txt, achei {txts}')
    return os.path.join(destino, txts[0])


def processar_arquivo(arquivo_7z, fonte, decl, tmp_base=None):
    with tempfile.TemporaryDirectory(dir=tmp_base) as tmp:
        return normalizar(ler_csv_filtrado(extrair(arquivo_7z, tmp)), fonte, decl)


# ---------------------------------------------------------------------------
# Manifesto, lacunas e montagem incremental
# ---------------------------------------------------------------------------

def meses(inicio, fim):
    """['202001', ..., fim] em AAAAMM."""
    a, m = int(inicio[:4]), int(inicio[4:])
    out = []
    while f'{a}{m:02d}' <= fim:
        out.append(f'{a}{m:02d}')
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return out


def lacunas_mov(nomes, ultimo):
    return [m for m in meses(PRIMEIRO_MES, ultimo) if f'CAGEDMOV{m}.7z' not in nomes]


def mudou(antigo, novo):
    """Arquivo precisa ser (re)processado? Data vazia (modo offline) não conta como mudança."""
    if antigo is None or antigo['size'] != novo['size']:
        return True
    return bool(antigo.get('date') and novo.get('date') and antigo['date'] != novo['date'])


def listar_cache(cache_dir):
    """Listagem equivalente à do FTP a partir dos .7z completos do cache (modo offline)."""
    out = {}
    for nome in os.listdir(cache_dir) if os.path.isdir(cache_dir) else []:
        if caged_ftp.RE_ARQUIVO.match(nome):
            out[nome] = {'size': os.path.getsize(os.path.join(cache_dir, nome)), 'date': ''}
    return out


def ler_json(caminho, padrao):
    if not os.path.exists(caminho):
        return padrao
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def gravar(fato, manifesto):
    os.makedirs(FACT_DIR, exist_ok=True)
    fato = fato.sort_values(['decl', 'fonte', 'competencia', 'municipio', 'subclasse'],
                            kind='stable').reset_index(drop=True)
    tmp = FACT_PATH + '.tmp'
    fato.to_parquet(tmp, index=False, compression='zstd')
    os.replace(tmp, FACT_PATH)
    gravar_manifesto(manifesto)
    return fato


def gravar_manifesto(manifesto):
    os.makedirs(FACT_DIR, exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(manifesto.items())), f, indent=1)
        f.write('\n')


def construir(listagem, cache_dir, online, force=False):
    nomes = set(listagem)
    ultimo = caged_ftp.ultimo_publicado(listagem)
    falta = lacunas_mov(nomes, ultimo)
    if falta:
        print(f'ERRO: CAGEDMOV ausente para {falta} (período {PRIMEIRO_MES}..{ultimo})', file=sys.stderr)
        return 1

    manifesto = ler_json(MANIFEST_PATH, {})
    fato = pd.read_parquet(FACT_PATH) if os.path.exists(FACT_PATH) else None
    pendentes = sorted((n for n in nomes if force or mudou(manifesto.get(n), listagem[n])),
                       key=lambda n: (n[8:14], n[5:8] != 'MOV', n))
    removidos = sorted(set(manifesto) - nomes) if online else []
    print(f'último mês publicado: {ultimo}; {len(nomes)} arquivos; {len(pendentes)} a processar'
          + (f'; {len(removidos)} removidos do FTP' if removidos else ''), flush=True)

    if removidos and fato is not None:
        k = fato['fonte'].astype(str) + fato['decl'].astype(str)
        fato = fato[~k.isin({n[5:14] for n in removidos})]
        for n in removidos:
            manifesto.pop(n)

    # metadados novos para arquivos inalterados (ex.: data preenchida após execução offline)
    for n in nomes - set(pendentes):
        if n in manifesto:
            manifesto[n] = {'size': listagem[n]['size'], 'date': listagem[n]['date'] or manifesto[n].get('date', '')}

    novos, feitos = [], []
    tmp_base = cache_dir if os.path.isdir(cache_dir) else None
    for i, nome in enumerate(pendentes, 1):
        fonte, decl = nome[5:8], nome[8:14]
        antigo = manifesto.get(nome)
        if online and antigo and antigo.get('date') and listagem[nome]['date'] \
                and antigo['date'] != listagem[nome]['date']:
            # republicado com outra data: baixar() reaproveitaria o .7z velho de mesmo size
            local = os.path.join(cache_dir, nome)
            if os.path.exists(local):
                os.remove(local)
        caminho =(caged_ftp.baixar(nome, listagem[nome]['size'], cache_dir) if online
                   else os.path.join(cache_dir, nome))
        df = processar_arquivo(caminho, fonte, decl, tmp_base)
        antes = (df['competencia'] < '2020-01').sum()
        if antes:
            df = df[df['competencia'] >= '2020-01'].reset_index(drop=True)
        print(f'  [{i}/{len(pendentes)}] {nome}: {len(df):,} linhas PR/seção A'
              + (f' ({antes} com competência < 2020-01 descartadas)' if antes else ''), flush=True)
        novos.append(df)
        feitos.append(nome)
        if len(feitos) % GRAVAR_A_CADA == 0 or i == len(pendentes):
            fato = _aplicar(fato, novos, feitos, manifesto, listagem)
            novos, feitos = [], []

    if fato is None:
        print('ERRO: fato vazio', file=sys.stderr)
        return 1
    if removidos and not pendentes:
        fato = gravar(fato, manifesto)
    elif not pendentes:
        gravar_manifesto(manifesto)  # só metadados (ex.: datas do FTP após execução offline)

    sem_mov = [m for m in meses(PRIMEIRO_MES, ultimo)
               if not ((fato['fonte'] == 'MOV') & (fato['decl'] == m)).any()]
    if sem_mov:
        print(f'ERRO: fato sem linhas de MOV para {sem_mov}', file=sys.stderr)
        return 1
    resumo = fato.groupby('fonte', observed=True)['w'].agg(['size', 'sum'])
    print(f'fato: {len(fato):,} linhas -> {FACT_PATH}\n{resumo}')
    return 0


def _aplicar(fato, novos, feitos, manifesto, listagem):
    """Substitui as linhas dos arquivos processados, grava fato e manifesto (checkpoint)."""
    chaves = {n[5:14] for n in feitos}
    if fato is not None and len(fato):
        k = fato['fonte'].astype(str) + fato['decl'].astype(str)
        fato = fato[~k.isin(chaves)]
    partes = [p for p in [fato, *novos] if p is not None and len(p)]
    fato = pd.concat(partes, ignore_index=True) if partes else novos[0]
    for n in feitos:
        manifesto[n] = {'size': listagem[n]['size'], 'date': listagem[n]['date']}
    return gravar(fato, manifesto)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--offline', action='store_true', help='usa só os .7z do cache, sem FTP')
    ap.add_argument('--force', action='store_true', help='reprocessa todos os arquivos')
    args = ap.parse_args(argv)
    cache_dir = caged_ftp.CACHE_DIR
    if args.offline:
        listagem = listar_cache(cache_dir)
        if not listagem:
            print(f'ERRO: nenhum .7z em {cache_dir}', file=sys.stderr)
            return 1
        print(f'modo offline: {cache_dir} (último MOV local = {caged_ftp.ultimo_publicado(listagem)})')
    else:
        listagem = caged_ftp.listar_ftp()
    return construir(listagem, cache_dir, online=not args.offline, force=args.force)


if __name__ == '__main__':
    sys.exit(main())
