function Bar({ className = '' }) {
  return <span className={`skeleton-bar ${className}`} aria-hidden="true" />;
}

export function Skeleton({ className = '', label = 'Loading…' }) {
  return <span className={`skeleton ${className}`} role="status"><span className="sr-only">{label}</span></span>;
}

export function TableSkeleton({ columns, rows = 6, label = 'Loading table…' }) {
  return (
    <tbody className="skeleton-table" aria-busy="true">
      <tr className="sr-only"><td colSpan={columns}>{label}</td></tr>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => <td key={column}><Bar className={`skeleton-cell skeleton-cell-${(row + column) % 3}`} /></td>)}
        </tr>
      ))}
    </tbody>
  );
}

export function DashboardSkeleton() {
  return <div className="cards skeleton-cards" aria-busy="true"><Skeleton /><Skeleton /><Skeleton /></div>;
}
