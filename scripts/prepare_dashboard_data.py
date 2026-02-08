"""
Processamento de dados para o Dashboard de Emprego Agrícola do Paraná
Gera JSONs otimizados para o frontend React
"""

import os
import json
import pandas as pd
import numpy as np
from datetime import datetime

# Diretórios
SCRIPT_DIR = os.path.dirname(__file__)
RAW_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'raw')
PROCESSED_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'processed')
DASHBOARD_DIR = os.path.join(SCRIPT_DIR, '..', 'dashboard', 'public', 'data')


def load_data():
    """Carrega os dados do CAGED."""
    # Primeiro tentar dados reais do FTP
    real_parquet = os.path.join(RAW_DIR, 'caged_agro_pr_real.parquet')
    if os.path.exists(real_parquet):
        df = pd.read_parquet(real_parquet)
        df['_is_real'] = True
        return df

    real_csv = os.path.join(RAW_DIR, 'caged_agro_pr_real.csv')
    if os.path.exists(real_csv):
        df = pd.read_csv(real_csv)
        df['_is_real'] = True
        return df

    # Fallback para dados simulados
    sample_parquet = os.path.join(RAW_DIR, 'caged_agro_pr_sample.parquet')
    if os.path.exists(sample_parquet):
        df = pd.read_parquet(sample_parquet)
        df['_is_real'] = False
        return df

    sample_csv = os.path.join(RAW_DIR, 'caged_agro_pr_sample.csv')
    if os.path.exists(sample_csv):
        df = pd.read_csv(sample_csv)
        df['_is_real'] = False
        return df

    raise FileNotFoundError("Dados não encontrados. Execute download_caged_ftp.py primeiro.")


def generate_kpis(df):
    """Gera KPIs gerais."""

    # Último período disponível
    ultimo_periodo = df['periodo'].max()
    df_ultimo = df[df['periodo'] == ultimo_periodo]

    # Totais do último período
    admissoes_ultimo = df_ultimo['admissoes'].sum()
    demissoes_ultimo = df_ultimo['demissoes'].sum()
    saldo_ultimo = df_ultimo['saldo'].sum()
    salario_medio_ultimo = df_ultimo['salario_medio'].mean()

    # Totais acumulados (todo o período)
    total_admissoes = df['admissoes'].sum()
    total_demissoes = df['demissoes'].sum()
    total_saldo = df['saldo'].sum()

    # Variação em relação ao período anterior
    periodos = sorted(df['periodo'].unique())
    if len(periodos) >= 2:
        penultimo_periodo = periodos[-2]
        df_penultimo = df[df['periodo'] == penultimo_periodo]
        saldo_penultimo = df_penultimo['saldo'].sum()
        variacao_saldo = ((saldo_ultimo - saldo_penultimo) / abs(saldo_penultimo) * 100) if saldo_penultimo != 0 else 0
    else:
        variacao_saldo = 0

    # Estoque estimado (soma dos estoques por divisão, se existir)
    if 'estoque_estimado' in df_ultimo.columns:
        estoque_atual = df_ultimo['estoque_estimado'].sum()
    else:
        # Estimar com base no saldo acumulado + base inicial
        estoque_base = 150000  # Estimativa base para agropecuária PR
        saldo_acumulado = df['saldo'].sum()
        estoque_atual = estoque_base + saldo_acumulado

    return {
        'periodo_referencia': ultimo_periodo,
        'ultimo_mes': {
            'admissoes': int(admissoes_ultimo),
            'demissoes': int(demissoes_ultimo),
            'saldo': int(saldo_ultimo),
            'salario_medio': round(salario_medio_ultimo, 2),
        },
        'acumulado': {
            'total_admissoes': int(total_admissoes),
            'total_demissoes': int(total_demissoes),
            'total_saldo': int(total_saldo),
        },
        'variacao_saldo_pct': round(variacao_saldo, 1),
        'estoque_estimado': int(estoque_atual),
    }


def generate_timeseries(df):
    """Gera série temporal mensal."""

    ts = df.groupby('periodo').agg({
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum',
        'salario_medio': 'mean',
    }).reset_index()

    ts['salario_medio'] = ts['salario_medio'].round(2)

    # Calcular saldo acumulado
    ts['saldo_acumulado'] = ts['saldo'].cumsum()

    return ts.to_dict(orient='records')


def generate_by_divisao(df):
    """Gera dados agregados por divisão CNAE."""

    agg_dict = {
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum',
        'salario_medio': 'mean',
    }

    if 'estoque_estimado' in df.columns:
        agg_dict['estoque_estimado'] = 'last'

    by_div = df.groupby(['divisao_cnae', 'divisao_nome']).agg(agg_dict).reset_index()

    by_div['salario_medio'] = by_div['salario_medio'].round(2)
    by_div['percentual_admissoes'] = (by_div['admissoes'] / by_div['admissoes'].sum() * 100).round(1)

    # Adicionar estoque estimado se não existir
    if 'estoque_estimado' not in by_div.columns:
        # Estimar proporcionalmente baseado nas admissões
        total_estoque = 150000 + df['saldo'].sum()
        by_div['estoque_estimado'] = (by_div['admissoes'] / by_div['admissoes'].sum() * total_estoque).astype(int)

    return by_div.to_dict(orient='records')


def generate_timeseries_by_divisao(df):
    """Gera série temporal por divisão CNAE."""

    ts = df.groupby(['periodo', 'divisao_cnae', 'divisao_nome']).agg({
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum',
    }).reset_index()

    return ts.to_dict(orient='records')


def generate_seasonality(df):
    """Gera padrão de sazonalidade (média por mês)."""

    df_copy = df.copy()
    df_copy['mes'] = df_copy['mes'].astype(int)

    sazonal = df_copy.groupby('mes').agg({
        'admissoes': 'mean',
        'demissoes': 'mean',
        'saldo': 'mean',
    }).reset_index()

    # Adicionar nome do mês
    meses_nomes = {
        1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
        7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'
    }
    sazonal['mes_nome'] = sazonal['mes'].map(meses_nomes)

    # Calcular índice sazonal (média = 100)
    media_admissoes = sazonal['admissoes'].mean()
    sazonal['indice_sazonal'] = (sazonal['admissoes'] / media_admissoes * 100).round(1)

    return sazonal.to_dict(orient='records')


def generate_yearly_summary(df):
    """Gera resumo anual."""

    anual = df.groupby('ano').agg({
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum',
        'salario_medio': 'mean',
    }).reset_index()

    anual['salario_medio'] = anual['salario_medio'].round(2)

    # Calcular variação YoY
    anual['variacao_saldo_yoy'] = anual['saldo'].pct_change() * 100
    anual['variacao_saldo_yoy'] = anual['variacao_saldo_yoy'].fillna(0).round(1)

    return anual.to_dict(orient='records')


def generate_metadata(df):
    """Gera metadados do dashboard."""

    is_real = bool(df['_is_real'].iloc[0]) if '_is_real' in df.columns else False
    periodo_min = df['periodo'].min()
    periodo_max = df['periodo'].max()

    if is_real:
        fonte = 'CAGED/MTE - Microdados do Novo CAGED'
        notas = [
            'Dados oficiais do Ministério do Trabalho e Emprego',
            'Microdados baixados via FTP do PDET/MTE',
            'CNAE Seção A: Agricultura, Pecuária, Silvicultura e Pesca',
        ]
    else:
        fonte = 'CAGED/MTE (dados simulados baseados em estatísticas reais)'
        notas = [
            'Dados de exemplo baseados em estatísticas reais do Paraná',
            'Sazonalidade típica: safra (mar-jun), plantio (set-nov)',
            'Para dados oficiais, consulte o PDET/MTE',
        ]

    return {
        'titulo': 'Emprego Agrícola - Paraná',
        'subtitulo': 'Movimentações de emprego formal na agropecuária paranaense',
        'fonte': fonte,
        'atualizacao': datetime.now().strftime('%Y-%m-%d'),
        'periodo_inicial': periodo_min,
        'periodo_final': periodo_max,
        'uf': 'PR',
        'cnae_secao': 'A - Agricultura, Pecuária, Silvicultura, Pesca',
        'divisoes': [
            {'codigo': '01', 'nome': 'Agricultura e Pecuária'},
            {'codigo': '02', 'nome': 'Silvicultura'},
            {'codigo': '03', 'nome': 'Pesca e Aquicultura'},
        ],
        'notas': notas,
        'dados_reais': is_real,
    }


def main():
    """Processa os dados e gera JSONs para o dashboard."""

    print("=" * 60)
    print("Processamento de dados - Emprego Agrícola PR")
    print("=" * 60)

    # Criar diretórios
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    os.makedirs(DASHBOARD_DIR, exist_ok=True)

    # Carregar dados
    print("\nCarregando dados...")
    df = load_data()
    print(f"Registros: {len(df)}")

    # Gerar JSONs
    print("\nGerando JSONs...")

    outputs = {
        'kpis.json': generate_kpis(df),
        'timeseries.json': generate_timeseries(df),
        'by_divisao.json': generate_by_divisao(df),
        'timeseries_divisao.json': generate_timeseries_by_divisao(df),
        'seasonality.json': generate_seasonality(df),
        'yearly.json': generate_yearly_summary(df),
        'metadata.json': generate_metadata(df),
    }

    # Criar arquivo agregado com todos os dados
    aggregated = {
        'metadata': outputs['metadata.json'],
        'kpis': outputs['kpis.json'],
        'timeseries': outputs['timeseries.json'],
        'byDivisao': outputs['by_divisao.json'],
        'timeseriesDivisao': outputs['timeseries_divisao.json'],
        'seasonality': outputs['seasonality.json'],
        'yearly': outputs['yearly.json'],
    }

    # Salvar arquivos individuais
    for filename, data in outputs.items():
        filepath = os.path.join(DASHBOARD_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  Salvo: {filename}")

    # Salvar arquivo agregado
    aggregated_path = os.path.join(DASHBOARD_DIR, 'aggregated.json')
    with open(aggregated_path, 'w', encoding='utf-8') as f:
        json.dump(aggregated, f, ensure_ascii=False, indent=2)
    print(f"  Salvo: aggregated.json")

    # Resumo
    print("\n" + "=" * 60)
    print("RESUMO")
    print("=" * 60)
    print(f"\nKPIs:")
    kpis = outputs['kpis.json']
    print(f"  Período: {kpis['periodo_referencia']}")
    print(f"  Admissões (último mês): {kpis['ultimo_mes']['admissoes']:,}")
    print(f"  Demissões (último mês): {kpis['ultimo_mes']['demissoes']:,}")
    print(f"  Saldo (último mês): {kpis['ultimo_mes']['saldo']:,}")
    print(f"  Salário médio: R$ {kpis['ultimo_mes']['salario_medio']:,.2f}")
    print(f"  Estoque estimado: {kpis['estoque_estimado']:,}")

    print(f"\nArquivos gerados em: {DASHBOARD_DIR}")

    return aggregated


if __name__ == '__main__':
    main()
