// Cabeçalho de tabela ordenável (fora do render dos componentes que o usam).
export default function SortTh({ col, label, align = 'left', sortCol, sortDir, onSort, title }) {
  return (
    <th
      className={`py-3 px-2 cursor-pointer hover:bg-neutral-100 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(col)}
      title={title}
      aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {label} {sortCol === col && <span className="text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}
