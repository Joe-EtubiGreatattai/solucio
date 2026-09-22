import { render, screen, waitFor } from '@testing-library/react';
import { AuthContext } from '../auth/AuthContext';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import CashFlowAnalysis from './CashFlowAnalysis';
import { api } from '../api';
import { fakeSocket } from '../test/live';

vi.mock('../api', () => ({ api: { get: vi.fn() }, API_BASE: '', getToken: () => null }));

const range = { from: '2026-02-01', to: '2026-02-05' };

const data = {
  range,
  bucket: 'day',
  series: [
    { date: '2026-02-01', income: 100000, expenses: 20000, net: 80000, cumulative: 580000 },
    { date: '2026-02-02', income: 0, expenses: 30000, net: -30000, cumulative: 550000 },
  ],
  totals: { income: 100000, expenses: 40000, net: 60000, cashOnHand: 550000 },
  previous: { income: 40000, expenses: 60000, net: -20000 },
  change: { income: 150, expenses: -16.7, net: null },
  burnRate: { avgDailyNet: 10000, runwayDays: null },
  topOutflows: [
    { type: 'Recurrent', group: 'Staff Wages', total: 30000, percent: 60 },
    { type: 'Recurrent', group: 'Rents', total: 20000, percent: 40 },
  ],
  incomeByMethod: [
    { method: 'transfer', total: 75000, percent: 75 },
    { method: 'pos', total: 25000, percent: 25 },
  ],
};

const renderIt = (auth = { can: () => true }) =>
  render(
    <AuthContext.Provider value={{ user: { _id: 'u1' }, refreshAccess: vi.fn(), logout: vi.fn(), ...auth }}>
      <RealtimeProvider connect={() => fakeSocket()}>
        <CashFlowAnalysis range={range} />
      </RealtimeProvider>
    </AuthContext.Provider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(data);
});

test('asks the server for the cash-flow report for the given range', async () => {
  renderIt();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/reports/cash-flow', range));
});

test('shows the headline totals', async () => {
  renderIt();
  expect(await screen.findByText('₦1,000.00')).toBeInTheDocument(); // income
  expect(screen.getByText('₦400.00')).toBeInTheDocument(); // expenses
  expect(screen.getByText('₦600.00')).toBeInTheDocument(); // net
  expect(screen.getByText('₦5,500.00')).toBeInTheDocument(); // cash on hand
});

test('shows a change badge comparing to the previous equal period, and "New" when there is nothing to compare', async () => {
  renderIt();
  await screen.findByText('₦1,000.00');
  expect(screen.getByText('+150%')).toBeInTheDocument();
  expect(screen.getByText('-16.7%')).toBeInTheDocument();
  expect(screen.getByText('New')).toBeInTheDocument();
});

test('explains the burn rate in words', async () => {
  renderIt();
  expect(await screen.findByText(/cash flow positive/i)).toBeInTheDocument();
});

test('warns with a runway estimate when burning cash', async () => {
  api.get.mockResolvedValue({ ...data, burnRate: { avgDailyNet: -20000, runwayDays: 12 } });
  renderIt();
  expect(await screen.findByText(/12 days/i)).toBeInTheDocument();
});

test('flags an empty cash buffer as urgent', async () => {
  api.get.mockResolvedValue({ ...data, burnRate: { avgDailyNet: -20000, runwayDays: 0 } });
  renderIt();
  expect(await screen.findByText(/no cash buffer/i)).toBeInTheDocument();
});

test('names the largest outflow as an actionable line, and lists the rest', async () => {
  renderIt();
  // Once in the "largest expense" summary sentence, once in the breakdown list below it.
  expect(await screen.findAllByText(/Staff Wages/)).toHaveLength(2);
  expect(screen.getAllByText(/60%/).length).toBeGreaterThan(0);
  expect(screen.getByText('Rents')).toBeInTheDocument();
});

test('breaks income down by method', async () => {
  renderIt();
  expect(await screen.findByText('Transfer')).toBeInTheDocument();
  expect(screen.getByText('POS')).toBeInTheDocument();
  expect(screen.getByText('75%')).toBeInTheDocument();
});

test('shows nothing sensitive, or breaks, when there is no data yet', async () => {
  api.get.mockResolvedValue({ ...data, totals: { income: 0, expenses: 0, net: 0, cashOnHand: 0 }, topOutflows: [], incomeByMethod: [], previous: { income: 0, expenses: 0, net: 0 }, change: { income: 0, expenses: 0, net: 0 } });
  renderIt();
  await waitFor(() => expect(api.get).toHaveBeenCalled());
  expect(screen.queryByText(/Staff Wages/)).toBeNull();
});

test('shows an error if the report cannot be loaded', async () => {
  api.get.mockRejectedValue(new Error('Cannot reach the server'));
  renderIt();
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
});
