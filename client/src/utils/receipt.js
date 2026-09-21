import { api } from '../api';

// window.open must run synchronously inside the click handler, so the window is opened
// first (default argument) and pointed at the PDF once it has downloaded.
export async function viewReceipt(id, win = window.open('', '_blank')) {
  try {
    const blob = await api.blob(`/incomes/${id}/receipt`);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
