export default function Card({ title, description, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 transition-shadow duration-200 hover:shadow-md ${className}`}>
      {title && <h3 className="chart-container-title">{title}</h3>}
      {description && <p className="chart-container-desc">{description}</p>}
      {!description && title && <div className="mb-4" />}
      {children}
    </div>
  )
}
