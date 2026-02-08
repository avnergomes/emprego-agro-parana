"""
Explorar estrutura completa dos microdados do CAGED
Baixa um mês de amostra e analisa todas as colunas disponíveis
"""

import os
import sys
from io import BytesIO
from ftplib import FTP
import tempfile
import py7zr
import pandas as pd

def explore_caged_structure():
    """Baixa um mês de amostra e explora a estrutura."""

    ano = 2024
    mes = 12
    ano_str = str(ano)
    mes_str = str(mes).zfill(2)

    ftp_path = f'/pdet/microdados/NOVO CAGED/{ano_str}/{ano_str}{mes_str}/CAGEDMOV{ano_str}{mes_str}.7z'

    print("=" * 80)
    print("ANÁLISE DA ESTRUTURA DOS MICRODADOS DO CAGED")
    print("=" * 80)
    print(f"\nBaixando amostra: {mes_str}/{ano_str}...")

    # Conectar ao FTP
    ftp = FTP('ftp.mtps.gov.br', timeout=120)
    ftp.login()

    # Download
    archive_bytes = BytesIO()
    ftp.retrbinary(f'RETR {ftp_path}', archive_bytes.write)
    archive_bytes.seek(0)
    ftp.quit()

    # Extrair
    with tempfile.TemporaryDirectory() as tmpdir:
        with py7zr.SevenZipFile(archive_bytes, mode='r') as archive:
            filenames = archive.getnames()
            txt_file = [f for f in filenames if f.endswith('.txt')][0]
            archive.extractall(path=tmpdir)

        txt_path = os.path.join(tmpdir, txt_file)
        df = pd.read_csv(txt_path, sep=';', encoding='UTF-8')

    print(f"Registros totais (Brasil): {len(df):,}")

    # Filtrar para PR
    df_pr = df[df['uf'] == 41].copy()
    print(f"Registros Paraná: {len(df_pr):,}")

    # Filtrar agropecuária
    df_pr['subclasse'] = df_pr['subclasse'].astype(str).str.zfill(7)
    df_pr['divisao'] = df_pr['subclasse'].str[:2]
    df_agro = df_pr[df_pr['divisao'].isin(['01', '02', '03'])].copy()
    print(f"Registros Agropecuária PR: {len(df_agro):,}")

    print("\n" + "=" * 80)
    print("COLUNAS DISPONÍVEIS NOS MICRODADOS")
    print("=" * 80)

    for col in df.columns:
        dtype = df[col].dtype
        n_unique = df[col].nunique()
        n_null = df[col].isnull().sum()

        # Amostras de valores
        samples = df[col].dropna().unique()[:5]
        samples_str = ', '.join([str(s) for s in samples])
        if len(samples_str) > 60:
            samples_str = samples_str[:57] + '...'

        print(f"\n{col}")
        print(f"  Tipo: {dtype} | Únicos: {n_unique:,} | Nulos: {n_null:,}")
        print(f"  Exemplos: {samples_str}")

    # Análise específica para PR Agropecuária
    print("\n" + "=" * 80)
    print("ANÁLISE DETALHADA - AGROPECUÁRIA PARANÁ")
    print("=" * 80)

    # Municípios
    if 'município' in df_agro.columns:
        n_mun = df_agro['município'].nunique()
        print(f"\nMunicípios com movimentação: {n_mun}")

    # CNAE detalhado
    print(f"\nCNAE Subclasses (7 dígitos): {df_agro['subclasse'].nunique()}")
    print(f"CNAE Grupos (4 dígitos): {df_agro['subclasse'].str[:4].nunique()}")
    print(f"CNAE Divisões (2 dígitos): {df_agro['divisao'].nunique()}")

    # Top subclasses
    print("\nTop 10 Subclasses CNAE:")
    top_cnae = df_agro['subclasse'].value_counts().head(10)
    for cnae, count in top_cnae.items():
        print(f"  {cnae}: {count:,} registros")

    # Salário
    if 'salário' in df_agro.columns:
        df_agro['salario_num'] = df_agro['salário'].astype(str).str.replace(',', '.').astype(float)
        print(f"\nSalário:")
        print(f"  Mínimo: R$ {df_agro['salario_num'].min():,.2f}")
        print(f"  Mediana: R$ {df_agro['salario_num'].median():,.2f}")
        print(f"  Média: R$ {df_agro['salario_num'].mean():,.2f}")
        print(f"  Máximo: R$ {df_agro['salario_num'].max():,.2f}")

    # Tipo de movimentação
    if 'saldomovimentação' in df_agro.columns:
        mov = df_agro['saldomovimentação'].value_counts()
        print(f"\nTipo de Movimentação:")
        for tipo, count in mov.items():
            label = "Admissão" if tipo == 1 else "Demissão"
            print(f"  {label}: {count:,}")

    # Grau de instrução
    if 'graudeinstrução' in df_agro.columns:
        print(f"\nGrau de Instrução (códigos únicos): {df_agro['graudeinstrução'].nunique()}")

    # Idade
    if 'idade' in df_agro.columns:
        print(f"\nIdade:")
        print(f"  Mínima: {df_agro['idade'].min()}")
        print(f"  Média: {df_agro['idade'].mean():.1f}")
        print(f"  Máxima: {df_agro['idade'].max()}")

    # Sexo
    if 'sexo' in df_agro.columns:
        sexo = df_agro['sexo'].value_counts()
        print(f"\nSexo:")
        for s, count in sexo.items():
            label = "Masculino" if s == 1 else "Feminino"
            print(f"  {label}: {count:,} ({count/len(df_agro)*100:.1f}%)")

    # Raça/Cor
    if 'raçacor' in df_agro.columns:
        print(f"\nRaça/Cor (códigos únicos): {df_agro['raçacor'].nunique()}")

    # Horas contratuais
    if 'horascontratuais' in df_agro.columns:
        print(f"\nHoras Contratuais:")
        print(f"  Média: {df_agro['horascontratuais'].mean():.1f}h")

    # Tipo de estabelecimento
    if 'tipoestabelecimento' in df_agro.columns:
        print(f"\nTipos de Estabelecimento: {df_agro['tipoestabelecimento'].nunique()}")

    # Porte do estabelecimento
    if 'tamestab' in df_agro.columns:
        print(f"\nPorte do Estabelecimento (categorias): {df_agro['tamestab'].nunique()}")

    print("\n" + "=" * 80)
    print("LISTA COMPLETA DE COLUNAS")
    print("=" * 80)
    print(", ".join(df.columns.tolist()))

    return df_agro


if __name__ == '__main__':
    df = explore_caged_structure()
