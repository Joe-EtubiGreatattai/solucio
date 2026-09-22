import { formatNaira } from '../utils/money';

export default function IncomeExpenseAnalysis({ summary }) {
  if (!summary) return null;

  const income = summary.income.total;
  const expenses = summary.spending.total;
  const net = summary.net;
  const ratio = income ? Math.round((expenses / income) * 100) : 0;
  const health = income === 0 ? 'No income recorded' : net >= 0 ? 'Cash positive' : 'Spending exceeds income';
  const message = income === 0
    ? 'Record income for this period to calculate a meaningful spending ratio.'
    : net >= 0
      ? `${ratio}% of income was spent, leaving ${formatNaira(net)} available.`
      : `Expenses are ${formatNaira(Math.abs(net))} higher than income. Review discretionary spending first.`;

  return (
    <section className="comparison-tool card" aria-labelledby="comparison-title">
      <div className="comparison-head"><div><p className="section-eyebrow">CASH FLOW ANALYSIS</p><h2 id="comparison-title">Income vs expenses</h2><p>{message}</p></div><span className={`cash-health ${net >= 0 ? 'positive' : 'negative'}`}>{health}</span></div>
      <div className="comparison-metrics">
        <div><span>Income</span><b>{formatNaira(income)}</b><small>{summary.income.count} entries</small></div>
        <div><span>Expenses</span><b>{formatNaira(expenses)}</b><small>{summary.spending.count} entries · {ratio}% of income</small></div>
        <div><span>Net cash flow</span><b className={net >= 0 ? 'income' : 'expense'}>{formatNaira(net)}</b><small>{net >= 0 ? 'Available after expenses' : 'Shortfall to address'}</small></div>
      </div>
    </section>
  );
}
