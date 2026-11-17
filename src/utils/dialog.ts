import { confirm } from '@tauri-apps/plugin-dialog';

export async function confirmNative(
  message: string,
  title = 'Confirm',
  destructive = true,
): Promise<boolean> {
  return confirm(message, {
    title,
    kind: destructive ? 'warning' : 'info',
    okLabel: destructive ? 'Delete' : 'OK',
    cancelLabel: 'Cancel',
  });
}
