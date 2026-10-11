"""
Acesso ao FTP do Novo CAGED (ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/{ano}/{AAAAMM}/).

- listar_ftp(): lista todos os CAGEDMOV/FOR/EXC publicados, com size e data do LIST (IIS).
- baixar(): baixa para o cache com retry/backoff; reaproveita arquivo local de mesmo size.
- 550 (arquivo inexistente) vira ArquivoAusente, sem retry.

O cache fica em CAGED_CACHE_DIR (default data/cache, fora do git).
Uso: python scripts/caged_ftp.py   (lista e mostra o último mês publicado)
"""

import ftplib
import os
import re
import sys
import time

HOST = 'ftp.mtps.gov.br'
BASE = '/pdet/microdados/NOVO CAGED'
ANO_INICIAL = 2020
TENTATIVAS = 4
TIMEOUT = 120

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.environ.get('CAGED_CACHE_DIR') or os.path.join(SCRIPT_DIR, '..', 'data', 'cache')

RE_ARQUIVO = re.compile(r'^CAGED(MOV|FOR|EXC)(\d{6})\.7z$')
# Formato do LIST do IIS: "09-29-26  02:42PM             50894750 CAGEDMOV202608.7z"
RE_LIST = re.compile(r'^(\d\d-\d\d-\d\d)\s+(\d\d:\d\d[AP]M)\s+(<DIR>|\d+)\s+(.+)$')


class ArquivoAusente(Exception):
    """Arquivo não existe no FTP (550). Não é erro para FOR/EXC."""


def parse_list(linhas):
    """Linhas do LIST -> lista de (nome, size|None se diretório, data 'MM-DD-YY HH:MMAM')."""
    itens = []
    for linha in linhas:
        m = RE_LIST.match(linha.strip())
        if m:
            d, h, tam, nome = m.groups()
            itens.append((nome, None if tam == '<DIR>' else int(tam), f'{d} {h}'))
    return itens


def _conectar():
    ftp = ftplib.FTP(HOST, timeout=TIMEOUT)
    ftp.encoding = 'latin-1'  # a raiz tem nomes acentuados em latin-1
    ftp.login()
    return ftp


def _com_retry(fn, descricao):
    """Executa fn(ftp) com conexão nova a cada tentativa; 550 propaga como ArquivoAusente."""
    for tentativa in range(1, TENTATIVAS + 1):
        ftp = None
        try:
            ftp = _conectar()
            return fn(ftp)
        except ftplib.error_perm as e:
            if str(e).startswith('550'):
                raise ArquivoAusente(f'{descricao}: {e}') from e
            raise
        except (OSError, EOFError, ftplib.error_temp, ftplib.error_reply) as e:
            if tentativa == TENTATIVAS:
                raise
            espera = 10 * 2 ** (tentativa - 1)
            print(f'  [ftp] {descricao}: {e!r}; nova tentativa em {espera}s', flush=True)
            time.sleep(espera)
        finally:
            if ftp is not None:
                try:
                    ftp.quit()
                except Exception:
                    ftp.close()


def _listar_dir(ftp, caminho):
    linhas = []
    ftp.cwd(caminho)
    ftp.retrlines('LIST', linhas.append)
    return parse_list(linhas)


def listar_ftp():
    """{nome: {'size': n, 'date': 'MM-DD-YY HH:MMAM', 'remoto': caminho}} de todos os meses publicados."""
    def _fn(ftp):
        arquivos = {}
        anos = sorted(n for n, tam, _ in _listar_dir(ftp, BASE)
                      if tam is None and n.isdigit() and int(n) >= ANO_INICIAL)
        for ano in anos:
            meses = sorted(n for n, tam, _ in _listar_dir(ftp, f'{BASE}/{ano}')
                           if tam is None and re.fullmatch(rf'{ano}\d\d', n))
            for mes in meses:
                pasta = f'{BASE}/{ano}/{mes}'
                for nome, tam, data in _listar_dir(ftp, pasta):
                    m = RE_ARQUIVO.match(nome)
                    if m and tam is not None and m.group(2) == mes:
                        arquivos[nome] = {'size': tam, 'date': data, 'remoto': f'{pasta}/{nome}'}
        return arquivos
    return _com_retry(_fn, 'listagem')


def ultimo_publicado(arquivos):
    """Último AAAAMM com CAGEDMOV publicado (sem folga fixa)."""
    meses = [RE_ARQUIVO.match(n).group(2) for n in arquivos if n.startswith('CAGEDMOV')]
    if not meses:
        raise RuntimeError('nenhum CAGEDMOV encontrado na listagem')
    return max(meses)


def remoto(nome):
    """Caminho remoto deduzido do nome (para arquivos fora da listagem)."""
    decl = RE_ARQUIVO.match(nome).group(2)
    return f'{BASE}/{decl[:4]}/{decl}/{nome}'


def baixar(nome, size, cache_dir=CACHE_DIR):
    """Garante o arquivo no cache com o size do FTP; devolve o caminho local."""
    os.makedirs(cache_dir, exist_ok=True)
    destino = os.path.join(cache_dir, nome)
    if os.path.exists(destino) and os.path.getsize(destino) == size:
        return destino
    parcial = destino + '.part'

    def _fn(ftp):
        with open(parcial, 'wb') as f:
            ftp.retrbinary(f'RETR {remoto(nome)}', f.write)
        obtido = os.path.getsize(parcial)
        if obtido != size:
            raise EOFError(f'size {obtido} != {size}')
        os.replace(parcial, destino)
        return destino

    try:
        return _com_retry(_fn, nome)
    finally:
        if os.path.exists(parcial):
            os.remove(parcial)


def main():
    arquivos = listar_ftp()
    ult = ultimo_publicado(arquivos)
    por_tipo = {t: sum(n.startswith(f'CAGED{t}') for n in arquivos) for t in ('MOV', 'FOR', 'EXC')}
    print(f'{len(arquivos)} arquivos no FTP {por_tipo}; último mês publicado: {ult}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
