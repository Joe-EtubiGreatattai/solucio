// Lets a wide table scroll sideways inside its card instead of overflowing the page.
// tabIndex makes the region keyboard-scrollable; the label tells screen readers what it holds.
export default function TableWrap({ label, children }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
