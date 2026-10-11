// Estado vazio padronizado: comunica ausência de registros em vez de eixos vazios.
export default function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-neutral-400" data-i18n-translate>Sem dados para exibir</div>
  )
}
