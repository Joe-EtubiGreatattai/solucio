import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoidDialog from './VoidDialog';

function Harness({ onConfirm = vi.fn().mockResolvedValue(), onCancel = vi.fn() }) {
  return (
    <>
      <button>Opener</button>
      <VoidDialog title="Void this income entry?" onConfirm={onConfirm} onCancel={onCancel} />
    </>
  );
}

test('is a labelled modal dialog and puts focus in the reason box', () => {
  render(<Harness />);
  const dialog = screen.getByRole('dialog', { name: 'Void this income entry?' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByLabelText('Reason')).toHaveFocus();
});

test('Escape cancels', async () => {
  const onCancel = vi.fn();
  render(<Harness onCancel={onCancel} />);
  await userEvent.keyboard('{Escape}');
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test('Tab stays inside the dialog', async () => {
  render(<Harness />);
  const reason = screen.getByLabelText('Reason');
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  const confirm = screen.getByRole('button', { name: 'Void entry' });
  expect(reason).toHaveFocus();
  await userEvent.tab();
  expect(cancel).toHaveFocus();
  await userEvent.tab();
  expect(confirm).toHaveFocus();
  await userEvent.tab(); // wraps to the first control, never to the page behind
  expect(reason).toHaveFocus();
  await userEvent.tab({ shift: true }); // and backwards
  expect(confirm).toHaveFocus();
});

test('focus returns to the element that opened it', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const { unmount } = render(<Harness />);
  expect(opener).not.toHaveFocus();
  unmount();
  expect(opener).toHaveFocus();
  opener.remove();
});

test('still asks for a reason', async () => {
  const onConfirm = vi.fn().mockResolvedValue();
  render(<Harness onConfirm={onConfirm} />);
  await userEvent.click(screen.getByRole('button', { name: 'Void entry' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Give a reason for voiding');
  expect(onConfirm).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Reason'), 'Entered twice');
  await userEvent.click(screen.getByRole('button', { name: 'Void entry' }));
  expect(onConfirm).toHaveBeenCalledWith('Entered twice');
});

test('shows a busy label and disables the button while confirming', async () => {
  let resolveConfirm;
  const onConfirm = vi.fn().mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve; }));
  render(<Harness onConfirm={onConfirm} />);
  await userEvent.type(screen.getByLabelText('Reason'), 'Entered twice');
  await userEvent.click(screen.getByRole('button', { name: 'Void entry' }));

  const busyButton = await screen.findByRole('button', { name: 'Voiding…' });
  expect(busyButton).toBeDisabled();

  resolveConfirm();
});
