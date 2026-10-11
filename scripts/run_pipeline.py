"""
Orquestrador do pipeline v2: download+fato -> checagem das regionais -> cubo -> reconciliação -> testes.
Para no primeiro passo que falhar (exit != 0), para que dados ruins não sejam commitados.

Uso:
  python scripts/run_pipeline.py                  # FTP -> fato incremental -> cubo -> testes
  python scripts/run_pipeline.py --skip-download  # só os .7z já presentes em CAGED_CACHE_DIR
"""

import argparse
import json
import os
import subprocess
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(SCRIPT_DIR, '..'))


def rodar(*args):
    cmd = [sys.executable, '-X', 'utf8', *args]
    print(f'\n=== {" ".join(args)}', flush=True)
    return subprocess.run(cmd, cwd=RAIZ).returncode


def checar_regionais():
    """399 municípios únicos e todo município do fato presente em regionais_pr.json."""
    import pandas as pd
    from build_fact import FACT_PATH
    with open(os.path.join(SCRIPT_DIR, 'regionais_pr.json'), encoding='utf-8') as f:
        muns = json.load(f)
    cods = {m['cod6'] for m in muns}
    if len(muns) != 399 or len(cods) != 399 or not all(m['reg'] and m['meso'] for m in muns):
        print('ERRO: regionais_pr.json deve ter 399 municípios únicos com regional e meso', file=sys.stderr)
        return 1
    fora = sorted(set(pd.read_parquet(FACT_PATH, columns=['municipio'])['municipio']) - cods)
    if fora:
        print(f'ERRO: municípios do fato fora de regionais_pr.json: {fora}', file=sys.stderr)
        return 1
    print('\n=== regionais: 399 municípios; todos os municípios do fato mapeados')
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--skip-download', action='store_true', help='usa só o cache local (sem FTP)')
    ap.add_argument('--force', action='store_true', help='reprocessa todos os arquivos do fato')
    args = ap.parse_args(argv)
    sys.path.insert(0, SCRIPT_DIR)

    fato = ['scripts/build_fact.py'] + (['--offline'] if args.skip_download else []) \
        + (['--force'] if args.force else [])
    passos = [
        lambda: rodar(*fato),
        checar_regionais,
        lambda: rodar('scripts/build_cube.py'),
        lambda: rodar('scripts/reconcile.py'),
        lambda: rodar('-m', 'unittest', 'discover', '-s', 'scripts/tests', '-p', 'test_*.py', '-v'),
    ]
    for passo in passos:
        rc = passo()
        if rc:
            print(f'\nPIPELINE FALHOU (exit {rc})', file=sys.stderr)
            return rc
    print('\nPIPELINE OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
