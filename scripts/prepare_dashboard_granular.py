"""
Processamento de dados granulares para o Dashboard
Gera múltiplas agregações permitindo filtros e drill-down
"""

import os
import json
import pandas as pd
import numpy as np
from datetime import datetime

# Diretórios
SCRIPT_DIR = os.path.dirname(__file__)
RAW_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'raw')
DASHBOARD_DIR = os.path.join(SCRIPT_DIR, '..', 'dashboard', 'public', 'data')
ASSETS_DIR = os.path.join(SCRIPT_DIR, '..', 'dashboard', 'public', 'assets')


def load_municipio_names():
    """Carrega mapeamento de código para nome de município."""
    geo_path = os.path.join(ASSETS_DIR, 'mun_PR.json')
    if not os.path.exists(geo_path):
        return {}

    with open(geo_path, 'r', encoding='utf-8') as f:
        geo = json.load(f)

    code_to_name = {}
    for feat in geo['features']:
        props = feat['properties']
        code_full = str(props['CodIbge'])
        code_6 = code_full[:6]
        code_to_name[code_6] = props['Municipio']

    return code_to_name


def load_cnae_descricoes():
    """Carrega descrições de CNAE."""
    cnae_path = os.path.join(SCRIPT_DIR, 'cnae_descricoes.json')
    if not os.path.exists(cnae_path):
        return {}

    with open(cnae_path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Importar mapeamentos
from cnae_cadeias import CADEIAS_CORES, CADEIAS_DESCRICAO, CNAE_CADEIA, get_cadeia


def load_microdata():
    """Carrega microdados e remapeia cadeia_produtiva."""
    path = os.path.join(RAW_DIR, 'caged_agro_pr_microdados.parquet')
    df = pd.read_parquet(path)

    # Guardar cadeia original para fallback
    cadeia_original = df['cadeia_produtiva'].copy()

    # Remapear cadeia_produtiva com base no mapeamento atual
    df['cnae_str'] = df['cnae_subclasse'].astype(str).str.zfill(7)
    df['cadeia_produtiva'] = df['cnae_str'].map(CNAE_CADEIA)

    # Usar cadeia original onde não há mapeamento novo
    df['cadeia_produtiva'] = df['cadeia_produtiva'].fillna(cadeia_original)

    # Limpar coluna temporária
    df.drop(columns=['cnae_str'], inplace=True)

    return df


def safe_json(obj):
    """Converte numpy types para Python nativos e remove NaN."""
    if isinstance(obj, dict):
        return {k: safe_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [safe_json(v) for v in obj]
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return [safe_json(v) for v in obj.tolist()]
    elif isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    return obj


def generate_metadata(df):
    """Gera metadados."""
    return {
        'titulo': 'Emprego Agrícola - Paraná',
        'subtitulo': 'Movimentações de emprego formal na agropecuária paranaense',
        'fonte': 'CAGED/MTE - Microdados do Novo CAGED',
        'atualizacao': datetime.now().strftime('%Y-%m-%d'),
        'periodo_inicial': df['periodo'].min(),
        'periodo_final': df['periodo'].max(),
        'total_registros': len(df),
        'total_municipios': df['municipio_codigo'].nunique(),
        'total_cadeias': df['cadeia_produtiva'].nunique(),
        'total_subclasses': df['cnae_subclasse'].nunique(),
    }


def generate_kpis(df):
    """Gera KPIs gerais."""
    ultimo_periodo = df['periodo'].max()
    df_ultimo = df[df['periodo'] == ultimo_periodo]

    admissoes_total = df['is_admissao'].sum()
    demissoes_total = df['is_demissao'].sum()
    saldo_total = admissoes_total - demissoes_total

    admissoes_ultimo = df_ultimo['is_admissao'].sum()
    demissoes_ultimo = df_ultimo['is_demissao'].sum()
    saldo_ultimo = admissoes_ultimo - demissoes_ultimo

    salario_medio = df['salario'].mean()
    salario_mediana = df['salario'].median()

    return {
        'periodo_referencia': ultimo_periodo,
        'ultimo_mes': {
            'admissoes': int(admissoes_ultimo),
            'demissoes': int(demissoes_ultimo),
            'saldo': int(saldo_ultimo),
        },
        'acumulado': {
            'admissoes': int(admissoes_total),
            'demissoes': int(demissoes_total),
            'saldo': int(saldo_total),
        },
        'salario': {
            'media': round(salario_medio, 2),
            'mediana': round(salario_mediana, 2),
        },
        'perfil': {
            'pct_masculino': round(df[df['sexo_nome'] == 'Masculino'].shape[0] / len(df) * 100, 1),
            'idade_media': round(df['idade_anos'].mean(), 1),
        }
    }


def generate_timeseries(df):
    """Série temporal mensal."""
    ts = df.groupby('periodo').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
    }).reset_index()

    ts.columns = ['periodo', 'admissoes', 'demissoes', 'salario_medio', 'salario_mediana']
    ts['saldo'] = ts['admissoes'] - ts['demissoes']
    ts['saldo_acumulado'] = ts['saldo'].cumsum()

    return ts.to_dict(orient='records')


def generate_by_cadeia(df):
    """Agregação por cadeia produtiva."""
    agg = df.groupby('cadeia_produtiva').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median', 'std'],
        'cnae_subclasse': 'nunique',
        'municipio_codigo': 'nunique',
    }).reset_index()

    agg.columns = ['cadeia', 'admissoes', 'demissoes', 'salario_medio',
                   'salario_mediana', 'salario_std', 'n_subclasses', 'n_municipios']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['pct_admissoes'] = (agg['admissoes'] / agg['admissoes'].sum() * 100).round(1)
    agg['cor'] = agg['cadeia'].map(CADEIAS_CORES).fillna('#808080')
    agg['descricao'] = agg['cadeia'].map(CADEIAS_DESCRICAO).fillna('')

    return agg.sort_values('admissoes', ascending=False).to_dict(orient='records')


def generate_timeseries_cadeia(df):
    """Série temporal por cadeia."""
    ts = df.groupby(['periodo', 'cadeia_produtiva']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()

    ts.columns = ['periodo', 'cadeia', 'admissoes', 'demissoes']
    ts['saldo'] = ts['admissoes'] - ts['demissoes']

    return ts.to_dict(orient='records')


def generate_by_cnae(df, cnae_desc):
    """Agregação por CNAE subclasse (máxima granularidade)."""
    agg = df.groupby(['cnae_subclasse', 'cadeia_produtiva']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
        'municipio_codigo': 'nunique',
    }).reset_index()

    agg.columns = ['cnae', 'cadeia', 'admissoes', 'demissoes',
                   'salario_medio', 'salario_mediana', 'n_municipios']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['descricao'] = agg['cnae'].map(cnae_desc).fillna('Não especificado')

    return agg.sort_values('admissoes', ascending=False).to_dict(orient='records')


def generate_by_municipio(df, mun_names):
    """Agregação por município."""
    agg = df.groupby('municipio_codigo').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
        'cadeia_produtiva': lambda x: x.value_counts().index[0],  # cadeia dominante
    }).reset_index()

    agg.columns = ['codigo', 'admissoes', 'demissoes', 'salario_medio', 'cadeia_dominante']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['nome'] = agg['codigo'].map(mun_names).fillna(agg['codigo'])

    return agg.sort_values('admissoes', ascending=False).to_dict(orient='records')


def generate_by_sexo(df):
    """Agregação por sexo."""
    agg = df.groupby('sexo_nome').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
    }).reset_index()

    agg.columns = ['sexo', 'admissoes', 'demissoes', 'salario_medio', 'salario_mediana']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['pct'] = (agg['admissoes'] / agg['admissoes'].sum() * 100).round(1)

    return agg.to_dict(orient='records')


def generate_by_faixa_etaria(df):
    """Agregação por faixa etária."""
    ordem = ['Menor de 18', '18 a 24 anos', '25 a 29 anos', '30 a 39 anos',
             '40 a 49 anos', '50 a 64 anos', '65 anos ou mais', 'Não informado']

    agg = df.groupby('faixa_etaria').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
    }).reset_index()

    agg.columns = ['faixa', 'admissoes', 'demissoes', 'salario_medio', 'salario_mediana']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['pct'] = (agg['admissoes'] / agg['admissoes'].sum() * 100).round(1)

    # Ordenar
    agg['ordem'] = agg['faixa'].apply(lambda x: ordem.index(x) if x in ordem else 99)
    agg = agg.sort_values('ordem').drop('ordem', axis=1)

    return agg.to_dict(orient='records')


def generate_by_escolaridade(df):
    """Agregação por escolaridade."""
    agg = df.groupby('escolaridade_nome').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
    }).reset_index()

    agg.columns = ['escolaridade', 'admissoes', 'demissoes', 'salario_medio', 'salario_mediana']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['pct'] = (agg['admissoes'] / agg['admissoes'].sum() * 100).round(1)

    return agg.sort_values('admissoes', ascending=False).to_dict(orient='records')


def generate_by_porte(df):
    """Agregação por porte da empresa."""
    agg = df.groupby('porte_empresa_nome').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': ['mean', 'median'],
    }).reset_index()

    agg.columns = ['porte', 'admissoes', 'demissoes', 'salario_medio', 'salario_mediana']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['pct'] = (agg['admissoes'] / agg['admissoes'].sum() * 100).round(1)

    return agg.to_dict(orient='records')


def generate_seasonality(df):
    """Sazonalidade mensal."""
    df_copy = df.copy()
    df_copy['mes_num'] = df_copy['mes'].astype(int)

    sazonal = df_copy.groupby('mes_num').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()

    sazonal.columns = ['mes', 'admissoes', 'demissoes']
    sazonal['saldo'] = sazonal['admissoes'] - sazonal['demissoes']

    meses = {1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
             7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'}
    sazonal['mes_nome'] = sazonal['mes'].map(meses)

    # Índice sazonal
    media = sazonal['admissoes'].mean()
    sazonal['indice'] = (sazonal['admissoes'] / media * 100).round(1)

    return sazonal.to_dict(orient='records')


def generate_yearly(df):
    """Resumo anual."""
    anual = df.groupby('ano').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
    }).reset_index()

    anual.columns = ['ano', 'admissoes', 'demissoes', 'salario_medio']
    anual['saldo'] = anual['admissoes'] - anual['demissoes']

    return anual.to_dict(orient='records')


def generate_cross_cadeia_sexo(df):
    """Cruzamento cadeia x sexo."""
    cross = df.groupby(['cadeia_produtiva', 'sexo_nome']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
    }).reset_index()

    cross.columns = ['cadeia', 'sexo', 'admissoes', 'demissoes', 'salario_medio']
    cross['saldo'] = cross['admissoes'] - cross['demissoes']

    return cross.to_dict(orient='records')


def generate_cross_cadeia_idade(df):
    """Cruzamento cadeia x faixa etária."""
    cross = df.groupby(['cadeia_produtiva', 'faixa_etaria']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()

    cross.columns = ['cadeia', 'faixa', 'admissoes', 'demissoes']
    cross['saldo'] = cross['admissoes'] - cross['demissoes']

    return cross.to_dict(orient='records')


def generate_cross_cadeia_escolaridade(df):
    """Cruzamento cadeia x escolaridade."""
    cross = df.groupby(['cadeia_produtiva', 'escolaridade_nome']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
    }).reset_index()

    cross.columns = ['cadeia', 'escolaridade', 'admissoes', 'demissoes', 'salario_medio']
    cross['saldo'] = cross['admissoes'] - cross['demissoes']

    return cross.to_dict(orient='records')


def generate_salary_distribution(df):
    """Distribuição salarial por cadeia."""
    result = []

    for cadeia in df['cadeia_produtiva'].unique():
        df_cadeia = df[df['cadeia_produtiva'] == cadeia]['salario'].dropna()

        if len(df_cadeia) > 0:
            result.append({
                'cadeia': cadeia,
                'min': float(df_cadeia.min()),
                'p10': float(df_cadeia.quantile(0.10)),
                'p25': float(df_cadeia.quantile(0.25)),
                'p50': float(df_cadeia.median()),
                'p75': float(df_cadeia.quantile(0.75)),
                'p90': float(df_cadeia.quantile(0.90)),
                'max': float(df_cadeia.max()),
                'mean': float(df_cadeia.mean()),
                'std': float(df_cadeia.std()),
            })

    return result


def generate_top_municipios(df, mun_names, n=20):
    """Top municípios por movimentação."""
    agg = df.groupby('municipio_codigo').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
        'cadeia_produtiva': lambda x: x.value_counts().index[0],
    }).reset_index()

    agg.columns = ['codigo', 'admissoes', 'demissoes', 'salario_medio', 'cadeia_dominante']
    agg['saldo'] = agg['admissoes'] - agg['demissoes']
    agg['nome'] = agg['codigo'].map(mun_names).fillna(agg['codigo'])

    return agg.nlargest(n, 'admissoes').to_dict(orient='records')


def generate_granular_cube(df):
    """
    Gera cubo granular para filtros regionais interativos.
    Cada registro representa um (município × período × cadeia).
    Permite filtrar por região e reagregar qualquer dimensão no frontend.
    """
    print("  Gerando cubo granular...")

    # Agregar por município × período × cadeia
    cube = df.groupby(['municipio_codigo', 'periodo', 'cadeia_produtiva']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
    }).reset_index()

    cube.columns = ['mun', 'periodo', 'cadeia', 'admissoes', 'demissoes', 'salario_medio']
    cube['saldo'] = cube['admissoes'] - cube['demissoes']

    # Converter para int onde possível (reduz tamanho do JSON)
    cube['admissoes'] = cube['admissoes'].astype(int)
    cube['demissoes'] = cube['demissoes'].astype(int)
    cube['saldo'] = cube['saldo'].astype(int)
    cube['salario_medio'] = cube['salario_medio'].round(2)

    print(f"    Registros no cubo: {len(cube):,}")
    print(f"    Municípios: {cube['mun'].nunique()}")
    print(f"    Períodos: {cube['periodo'].nunique()}")
    print(f"    Cadeias: {cube['cadeia'].nunique()}")

    return cube.to_dict(orient='records')


def generate_granular_dimensions(df):
    """
    Gera dados granulares por dimensão demográfica (município × período × cadeia × dimensão).
    Inclui cadeia para permitir filtros cruzados entre cadeia e dimensões demográficas.
    """
    print("  Gerando dimensões granulares (com cadeia)...")

    dimensions = {}

    # Por Sexo (inclui cadeia para cross-filtering)
    sexo_cube = df.groupby(['municipio_codigo', 'periodo', 'cadeia_produtiva', 'sexo_nome']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()
    sexo_cube.columns = ['mun', 'periodo', 'cadeia', 'sexo', 'admissoes', 'demissoes']
    sexo_cube['admissoes'] = sexo_cube['admissoes'].astype(int)
    sexo_cube['demissoes'] = sexo_cube['demissoes'].astype(int)
    dimensions['bySexo'] = sexo_cube.to_dict(orient='records')
    print(f"    Sexo: {len(sexo_cube):,} registros")

    # Por Faixa Etária (inclui cadeia)
    faixa_cube = df.groupby(['municipio_codigo', 'periodo', 'cadeia_produtiva', 'faixa_etaria']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()
    faixa_cube.columns = ['mun', 'periodo', 'cadeia', 'faixa', 'admissoes', 'demissoes']
    faixa_cube['admissoes'] = faixa_cube['admissoes'].astype(int)
    faixa_cube['demissoes'] = faixa_cube['demissoes'].astype(int)
    dimensions['byFaixa'] = faixa_cube.to_dict(orient='records')
    print(f"    Faixa Etária: {len(faixa_cube):,} registros")

    # Por Escolaridade (inclui cadeia)
    esc_cube = df.groupby(['municipio_codigo', 'periodo', 'cadeia_produtiva', 'escolaridade_nome']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
        'salario': 'mean',
    }).reset_index()
    esc_cube.columns = ['mun', 'periodo', 'cadeia', 'escolaridade', 'admissoes', 'demissoes', 'salario_medio']
    esc_cube['admissoes'] = esc_cube['admissoes'].astype(int)
    esc_cube['demissoes'] = esc_cube['demissoes'].astype(int)
    esc_cube['salario_medio'] = esc_cube['salario_medio'].round(2)
    dimensions['byEscolaridade'] = esc_cube.to_dict(orient='records')
    print(f"    Escolaridade: {len(esc_cube):,} registros")

    # Por Porte Empresa (inclui cadeia)
    porte_cube = df.groupby(['municipio_codigo', 'periodo', 'cadeia_produtiva', 'porte_empresa_nome']).agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum',
    }).reset_index()
    porte_cube.columns = ['mun', 'periodo', 'cadeia', 'porte', 'admissoes', 'demissoes']
    porte_cube['admissoes'] = porte_cube['admissoes'].astype(int)
    porte_cube['demissoes'] = porte_cube['demissoes'].astype(int)
    dimensions['byPorte'] = porte_cube.to_dict(orient='records')
    print(f"    Porte: {len(porte_cube):,} registros")

    return dimensions


def main():
    """Processa e gera todos os JSONs."""

    print("=" * 70)
    print("PROCESSAMENTO DE DADOS GRANULARES")
    print("=" * 70)

    os.makedirs(DASHBOARD_DIR, exist_ok=True)

    print("\nCarregando microdados...")
    df = load_microdata()
    print(f"Registros: {len(df):,}")

    print("\nCarregando nomes de municípios...")
    mun_names = load_municipio_names()
    print(f"Mapeamento de {len(mun_names)} municípios carregado")

    print("\nCarregando descrições de CNAE...")
    cnae_desc = load_cnae_descricoes()
    print(f"Mapeamento de {len(cnae_desc)} CNAEs carregado")

    print("\nGerando agregações...")

    outputs = {
        'metadata.json': generate_metadata(df),
        'kpis.json': generate_kpis(df),
        'timeseries.json': generate_timeseries(df),
        'by_cadeia.json': generate_by_cadeia(df),
        'timeseries_cadeia.json': generate_timeseries_cadeia(df),
        'by_cnae.json': generate_by_cnae(df, cnae_desc),
        'by_municipio.json': generate_by_municipio(df, mun_names),
        'by_sexo.json': generate_by_sexo(df),
        'by_faixa_etaria.json': generate_by_faixa_etaria(df),
        'by_escolaridade.json': generate_by_escolaridade(df),
        'by_porte.json': generate_by_porte(df),
        'seasonality.json': generate_seasonality(df),
        'yearly.json': generate_yearly(df),
        'cross_cadeia_sexo.json': generate_cross_cadeia_sexo(df),
        'cross_cadeia_idade.json': generate_cross_cadeia_idade(df),
        'cross_cadeia_escolaridade.json': generate_cross_cadeia_escolaridade(df),
        'salary_distribution.json': generate_salary_distribution(df),
        'top_municipios.json': generate_top_municipios(df, mun_names),
    }

    # Gerar cubo granular para filtros regionais
    print("\nGerando dados granulares para filtros regionais...")
    granular_cube = generate_granular_cube(df)
    granular_dimensions = generate_granular_dimensions(df)

    # Salvar arquivos
    for filename, data in outputs.items():
        filepath = os.path.join(DASHBOARD_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(safe_json(data), f, ensure_ascii=False, indent=2)
        print(f"  {filename}")

    # Criar agregado
    aggregated = {
        'metadata': outputs['metadata.json'],
        'kpis': outputs['kpis.json'],
        'timeseries': outputs['timeseries.json'],
        'byCadeia': outputs['by_cadeia.json'],
        'timeseriesCadeia': outputs['timeseries_cadeia.json'],
        'byCnae': outputs['by_cnae.json'],
        'byMunicipio': outputs['by_municipio.json'],
        'bySexo': outputs['by_sexo.json'],
        'byFaixaEtaria': outputs['by_faixa_etaria.json'],
        'byEscolaridade': outputs['by_escolaridade.json'],
        'byPorte': outputs['by_porte.json'],
        'seasonality': outputs['seasonality.json'],
        'yearly': outputs['yearly.json'],
        'crossCadeiaSexo': outputs['cross_cadeia_sexo.json'],
        'crossCadeiaIdade': outputs['cross_cadeia_idade.json'],
        'crossCadeiaEscolaridade': outputs['cross_cadeia_escolaridade.json'],
        'salaryDistribution': outputs['salary_distribution.json'],
        'topMunicipios': outputs['top_municipios.json'],
    }

    agg_path = os.path.join(DASHBOARD_DIR, 'aggregated_full.json')
    with open(agg_path, 'w', encoding='utf-8') as f:
        json.dump(safe_json(aggregated), f, ensure_ascii=False)
    print(f"  aggregated_full.json")

    # Salvar cubo granular (para filtros regionais)
    cube_path = os.path.join(DASHBOARD_DIR, 'granular_cube.json')
    with open(cube_path, 'w', encoding='utf-8') as f:
        json.dump(safe_json(granular_cube), f, ensure_ascii=False)
    cube_size_mb = os.path.getsize(cube_path) / (1024 * 1024)
    print(f"  granular_cube.json ({cube_size_mb:.2f} MB)")

    # Salvar dimensões granulares
    dims_path = os.path.join(DASHBOARD_DIR, 'granular_dimensions.json')
    with open(dims_path, 'w', encoding='utf-8') as f:
        json.dump(safe_json(granular_dimensions), f, ensure_ascii=False)
    dims_size_mb = os.path.getsize(dims_path) / (1024 * 1024)
    print(f"  granular_dimensions.json ({dims_size_mb:.2f} MB)")

    print("\n" + "=" * 70)
    print("RESUMO")
    print("=" * 70)
    print(f"\nArquivos gerados: {len(outputs) + 3}")  # +3: aggregated_full, granular_cube, granular_dimensions
    print(f"Diretório: {DASHBOARD_DIR}")
    print(f"Cubo granular: {len(granular_cube):,} registros ({cube_size_mb:.2f} MB)")

    kpis = outputs['kpis.json']
    print(f"\nKPIs:")
    print(f"  Período: {outputs['metadata.json']['periodo_inicial']} a {outputs['metadata.json']['periodo_final']}")
    print(f"  Admissões totais: {kpis['acumulado']['admissoes']:,}")
    print(f"  Demissões totais: {kpis['acumulado']['demissoes']:,}")
    print(f"  Saldo: {kpis['acumulado']['saldo']:+,}")
    print(f"  Salário médio: R$ {kpis['salario']['media']:,.2f}")

    return outputs


if __name__ == '__main__':
    main()
