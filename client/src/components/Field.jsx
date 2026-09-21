export default function Field({ label, error, children }) {
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        {children}
      </label>
      {error && <small className="error" role="alert">{error}</small>}
    </div>
  );
}
