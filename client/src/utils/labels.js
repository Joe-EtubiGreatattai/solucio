export const accountLabel = (a) =>
  !a ? '' : a.type === 'bank' ? `${a.name} - ${a.bankName} ****${String(a.accountNumber).slice(-4)}` : a.name;
