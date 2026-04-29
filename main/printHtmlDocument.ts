import { App } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { getInitializedPrintWindow } from './saveHtmlAsPdf';

export async function printHtmlDocument(
  html: string,
  app: App,
  width: number,
  height: number,
  deviceName?: string
): Promise<boolean> {
  const tempRoot = app.getPath('temp');
  const tempFile = path.join(tempRoot, `temp-print.html`);
  await fs.writeFile(tempFile, html, { encoding: 'utf-8' });

  const printWindow = await getInitializedPrintWindow(tempFile, width, height);
  // On Windows, non-silent print can fail from a fully hidden window.
  // Show/focus before invoking print so the print dialog can initialize reliably.
  printWindow.show();
  printWindow.focus();

  let success = await new Promise<boolean>((resolve) => {
    printWindow.webContents.print(
      {
        silent: !!deviceName,
        deviceName: deviceName || undefined,
        printBackground: true,
      },
      (success, failureReason) => {
        if (!success && failureReason) {
          // Helps diagnose printer setup / queue failures in production.
          console.error(`Print failed: ${failureReason}`);
        }
        resolve(success);
      }
    );
  });

  // If preferred printer failed (offline/removed), fall back to print dialog.
  if (!success && deviceName) {
    success = await new Promise<boolean>((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (ok, failureReason) => {
          if (!ok && failureReason) {
            console.error(`Print failed after fallback: ${failureReason}`);
          }
          resolve(ok);
        }
      );
    });
  }

  printWindow.close();
  await fs.unlink(tempFile);
  return success;
}
