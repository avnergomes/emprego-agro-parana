export default function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-neutral-800 mb-4">{title}</h3>}
      {children}
    </div>
  )
}
