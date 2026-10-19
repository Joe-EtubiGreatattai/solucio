// A simple "Showing X–Y of Z" pager with Previous/Next buttons, shared by every list page so one page's
// worth of records is fetched at a time instead of the whole collection. Renders nothing when empty.
export default function Pagination({ page, limit, total, onPage }) {
  if (!total) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return (
    <div className="row pager">
      <span>{`Showing ${start}–${end} of ${total}`}</span>
      <button type="button" className="secondary" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button type="button" className="secondary" disabled={page * limit >= total} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
