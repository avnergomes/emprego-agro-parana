"""
Gera scripts/regionais_pr.json (399 municípios: cod6, nome, reg, meso) a partir do
TopoJSON do Datageo Paraná. Execução única; o JSON gerado é versionado.

Uso: python scripts/build_regionais.py [caminho_ou_url_do_topojson]
"""

import json
import os
import sys
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(SCRIPT_DIR, 'regionais_pr.json')
LOCAL = os.path.join(SCRIPT_DIR, '..', '..', 'datageoparana.github.io', 'assets',
                     'parana-municipalities.min.topojson')
URL = 'https://datageoparana.github.io/assets/parana-municipalities.min.topojson'


def carregar_topojson(origem):
    if origem.startswith('http'):
        with urllib.request.urlopen(origem, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    with open(origem, encoding='utf-8') as f:
        return json.load(f)


# Grafia oficial do IBGE onde o TopoJSON do Datageo diverge (chave: cod6)
NOME_OFICIAL = {'411680': 'Nova Cantu'}


def extrair(topo):
    geoms = topo['objects']['municipalities']['geometries']
    muns = [{
        'cod6': g['properties']['CodIbge'][:6],
        'nome': NOME_OFICIAL.get(g['properties']['CodIbge'][:6], g['properties']['Municipio']),
        'reg': g['properties']['RegIdr'],
        'meso': g['properties']['MesoIdr'],
    } for g in geoms]
    muns.sort(key=lambda m: m['cod6'])
    if len(muns) != 399 or len({m['cod6'] for m in muns}) != 399:
        raise ValueError(f'esperados 399 municípios únicos, vieram {len(muns)}')
    return muns


def main():
    origem = sys.argv[1] if len(sys.argv) > 1 else (LOCAL if os.path.exists(LOCAL) else URL)
    muns = extrair(carregar_topojson(origem))
    with open(SAIDA, 'w', encoding='utf-8') as f:
        # um município por linha: diff legível e arquivo pequeno
        f.write('[\n' + ',\n'.join(json.dumps(m, ensure_ascii=False) for m in muns) + '\n]\n')
    print(f'{len(muns)} municípios -> {SAIDA} (origem: {origem})')


if __name__ == '__main__':
    main()
