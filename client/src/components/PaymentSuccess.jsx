import { useState } from 'react';
import { formatDate } from '../utils/dates';
import { formatNaira } from '../utils/money';
import { accountLabel } from '../utils/labels';

const METHOD = { transfer: 'Bank transfer', pos: 'POS', cash: 'Cash' };

export default function PaymentSuccess({ income, account, onViewReceipt, onDismiss, canViewReceipt = true }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // onViewReceipt is called before any await so the receipt window opens inside the click gesture.
  const view = async () => {
    setBusy(true);
    setError('');
    try {
      await onViewReceipt(income._id);
    } catch (err) {
      setError(err.message || 'Could not open the receipt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card success" role="status">
      <div className="success-mark" aria-hidden="true">✓</div>
      <div className="success-body">
        <h2>Payment recorded</h2>
        <p className="success-receipt">Receipt <b>{income.receiptNumber}</b></p>
        <dl className="success-details">
          <div><dt>Amount</dt><dd>{formatNaira(income.amount)}</dd></div>
          <div><dt>Method</dt><dd>{METHOD[income.method] || income.method}</dd></div>
          <div><dt>Paid into</dt><dd>{accountLabel(account)}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(income.date)}</dd></div>
        </dl>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          {canViewReceipt && <button type="button" onClick={view} disabled={busy}>{busy ? 'Opening…' : 'View receipt'}</button>}
          <button type="button" className="secondary" onClick={onDismiss}>Record another payment</button>
        </div>
      </div>
    </div>
  );
}
