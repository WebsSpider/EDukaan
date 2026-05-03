import {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  app,
  dialog,
  ipcMain,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { execFile } from 'node:child_process';
import { constants } from 'fs';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import { SelectFileOptions, SelectFileReturn } from 'utils/types';
import databaseManager from '../backend/database/manager';
import { emitMainProcessError } from '../backend/helpers';
import { Main } from '../main';
import { DatabaseMethod } from '../utils/db/types';
import { IPC_ACTIONS } from '../utils/messages';
import { getUrlAndTokenString, sendError } from './contactMothership';
import { getLanguageMap } from './getLanguageMap';
import { getTemplates } from './getPrintTemplates';
import { printHtmlDocument } from './printHtmlDocument';
import {
  getConfigFilesWithModified,
  getErrorHandledReponse,
  isNetworkError,
  setAndGetCleanedConfigFiles,
} from './helpers';
import { saveHtmlAsPdf } from './saveHtmlAsPdf';
import { sendAPIRequest } from './api';
import { initScheduler } from './initSheduler';
import {
  getLicenseStatus,
  installLicenseFromJsonInternal,
  startTrialInternal,
  submitLicenseKeyInternal,
} from './license/service';
import {
  restoreBackupFile,
} from './backup/backupService';
import {
  patchBackupState,
  readBackupState,
} from './backup/backupStore';
import { isB2Configured } from './backup/b2Api';
import { runBackupWithNotifications, startBackupScheduler } from './backup/scheduler';

export default function registerIpcMainActionListeners(main: Main) {
  const execFileAsync = promisify(execFile);
  const getMacPrintersFromLpstat = async (): Promise<string[]> => {
    if (process.platform !== 'darwin') {
      return [];
    }
    try {
      const { stdout } = await execFileAsync('lpstat', ['-p']);
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('printer '))
        .map((line) => line.slice('printer '.length).split(' ')[0])
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  ipcMain.handle(IPC_ACTIONS.CHECK_DB_ACCESS, async (_, filePath: string) => {
    try {
      await fs.access(filePath, constants.W_OK | constants.R_OK);
    } catch (err) {
      return false;
    }

    return true;
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_DB_DEFAULT_PATH,
    async (_, companyName: string) => {
      let root: string;
      try {
        root = app.getPath('documents');
      } catch {
        root = app.getPath('userData');
      }

      if (main.isDevelopment) {
        root = 'dbs';
      }

      const dbsPath = path.join(root, 'EDukan');
      const backupPath = path.join(dbsPath, 'backups');
      await fs.ensureDir(backupPath);

      let dbFilePath = path.join(dbsPath, `${companyName}.books.db`);

      if (await fs.pathExists(dbFilePath)) {
        const option = await dialog.showMessageBox({
          type: 'question',
          title: 'File Exists',
          message: `Filename already exists. Do you want to overwrite the existing file or create a new one?`,
          buttons: ['Overwrite', 'New'],
        });

        if (option.response === 1) {
          const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '');

          dbFilePath = path.join(
            dbsPath,
            `${companyName}_${timestamp}.books.db`
          );

          await dialog.showMessageBox({
            type: 'info',
            message: `New file: ${path.basename(dbFilePath)}`,
          });
        }
      }

      return dbFilePath;
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_OPEN_FILEPATH,
    async (_, options: OpenDialogOptions) => {
      return await dialog.showOpenDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_SAVE_FILEPATH,
    async (_, options: SaveDialogOptions) => {
      return await dialog.showSaveDialog(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.GET_DIALOG_RESPONSE,
    async (_, options: MessageBoxOptions) => {
      if (main.isDevelopment || main.isLinux) {
        Object.assign(options, { icon: main.icon });
      }

      return await dialog.showMessageBox(main.mainWindow!, options);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SHOW_ERROR,
    (_, { title, content }: { title: string; content: string }) => {
      return dialog.showErrorBox(title, content);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.SAVE_HTML_AS_PDF,
    async (
      _,
      html: string,
      savePath: string,
      width: number,
      height: number
    ) => {
      return await saveHtmlAsPdf(html, savePath, app, width, height);
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.PRINT_HTML_DOCUMENT,
    async (
      _,
      html: string,
      width: number,
      height: number,
      deviceName?: string
    ) => {
      return await printHtmlDocument(html, app, width, height, deviceName);
    }
  );

  ipcMain.handle(IPC_ACTIONS.GET_PRINTERS, async () => {
    const electronPrinters =
      (await main.mainWindow?.webContents.getPrintersAsync()) ?? [];
    const names = electronPrinters
      .slice()
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((p) => p.name);

    if (names.length > 0) {
      return names;
    }

    // Electron can occasionally return an empty list on macOS.
    // Fall back to CUPS so users can still pick a default printer.
    return await getMacPrintersFromLpstat();
  });

  ipcMain.handle(
    IPC_ACTIONS.SAVE_DATA,
    async (_, data: string, savePath: string) => {
      return await fs.writeFile(savePath, data, { encoding: 'utf-8' });
    }
  );

  ipcMain.handle(IPC_ACTIONS.SEND_ERROR, async (_, bodyJson: string) => {
    await sendError(bodyJson, main);
  });

  ipcMain.handle(IPC_ACTIONS.CHECK_FOR_UPDATES, async () => {
    if (main.isDevelopment || main.checkedForUpdate) {
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      if (isNetworkError(error as Error)) {
        return;
      }

      emitMainProcessError(error);
    }
    main.checkedForUpdate = true;
  });

  ipcMain.handle(IPC_ACTIONS.GET_LANGUAGE_MAP, async (_, code: string) => {
    const obj = { languageMap: {}, success: true, message: '' };
    try {
      obj.languageMap = await getLanguageMap(code);
    } catch (err) {
      obj.success = false;
      obj.message = (err as Error).message;
    }

    return obj;
  });

  ipcMain.handle(
    IPC_ACTIONS.SELECT_FILE,
    async (_, options: SelectFileOptions): Promise<SelectFileReturn> => {
      const response: SelectFileReturn = {
        name: '',
        filePath: '',
        success: false,
        data: Buffer.from('', 'utf-8'),
        canceled: false,
      };
      const { filePaths, canceled } = await dialog.showOpenDialog(
        main.mainWindow!,
        { ...options, properties: ['openFile'] }
      );

      response.filePath = filePaths?.[0];
      response.canceled = canceled;

      if (!response.filePath) {
        return response;
      }

      response.success = true;
      if (canceled) {
        return response;
      }

      response.name = path.basename(response.filePath);
      response.data = await fs.readFile(response.filePath);
      return response;
    }
  );

  ipcMain.handle(IPC_ACTIONS.GET_CREDS, () => {
    return getUrlAndTokenString();
  });

  ipcMain.handle(IPC_ACTIONS.DELETE_FILE, async (_, filePath: string) => {
    return getErrorHandledReponse(async () => await fs.unlink(filePath));
  });

  ipcMain.handle(IPC_ACTIONS.GET_DB_LIST, async () => {
    const files = await setAndGetCleanedConfigFiles();
    return await getConfigFilesWithModified(files);
  });

  ipcMain.handle(IPC_ACTIONS.GET_ENV, async () => {
    let version = app.getVersion();
    if (main.isDevelopment) {
      const packageJson = await fs.readFile('package.json', 'utf-8');
      version = (JSON.parse(packageJson) as { version: string }).version;
    }

    return {
      isDevelopment: main.isDevelopment,
      platform: process.platform,
      version,
      uitestSkipAutoDb: process.env.EDUKAN_UITEST_SKIP_AUTO_DB === '1',
      uitestSkipLicenseOnboarding:
        process.env.EDUKAN_UITEST_SKIP_LICENSE === '1',
    };
  });

  ipcMain.handle(IPC_ACTIONS.LICENSE_GET_STATUS, async () => {
    return await getLicenseStatus();
  });

  ipcMain.handle(
    IPC_ACTIONS.LICENSE_START_TRIAL,
    async (_, companyName: string) => {
      return await startTrialInternal(
        typeof companyName === 'string' ? companyName : ''
      );
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.LICENSE_SUBMIT_KEY,
    async (_, key: string, companyName: string) => {
      return await submitLicenseKeyInternal(
        typeof key === 'string' ? key : '',
        typeof companyName === 'string' ? companyName : ''
      );
    }
  );

  ipcMain.handle(IPC_ACTIONS.LICENSE_INSTALL_JSON, async (_, rawJson: string) => {
    return await installLicenseFromJsonInternal(
      typeof rawJson === 'string' ? rawJson : ''
    );
  });

  ipcMain.handle(
    IPC_ACTIONS.GET_TEMPLATES,
    async (_, posPrintWidth?: number) => {
      return getTemplates(posPrintWidth);
    }
  );

  ipcMain.handle(IPC_ACTIONS.INIT_SHEDULER, async (_, interval: string) => {
    return initScheduler(interval);
  });

  ipcMain.handle(
    IPC_ACTIONS.SEND_API_REQUEST,
    async (e, endpoint: string, options: RequestInit | undefined) => {
      return sendAPIRequest(endpoint, options);
    }
  );

  /**
   * Database Related Actions
   */

  ipcMain.handle(
    IPC_ACTIONS.DB_CREATE,
    async (_, dbPath: string, countryCode: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.createNewDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CONNECT,
    async (_, dbPath: string, countryCode?: string) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.connectToDatabase(dbPath, countryCode);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_CALL,
    async (_, method: DatabaseMethod, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.call(method, ...args);
      });
    }
  );

  ipcMain.handle(
    IPC_ACTIONS.DB_BESPOKE,
    async (_, method: string, ...args: unknown[]) => {
      return await getErrorHandledReponse(async () => {
        return await databaseManager.callBespoke(method, ...args);
      });
    }
  );

  ipcMain.handle(IPC_ACTIONS.DB_SCHEMA, async () => {
    return await getErrorHandledReponse(() => {
      return databaseManager.getSchemaMap();
    });
  });

  /**
   * Google Drive Backup
   */

  // Start the hourly scheduler once the IPC layer is ready
  startBackupScheduler(() => main.mainWindow);

  ipcMain.handle(IPC_ACTIONS.BACKUP_IS_CONFIGURED, () => {
    return isB2Configured();
  });

  ipcMain.handle(IPC_ACTIONS.BACKUP_GET_STATUS, async () => {
    return await readBackupState();
  });

  ipcMain.handle(
    IPC_ACTIONS.BACKUP_SET_HOUR,
    async (_, hour: unknown, minute: unknown) => {
      const h = typeof hour === 'number' ? Math.max(0, Math.min(23, Math.round(hour))) : 2;
      const m = typeof minute === 'number' ? Math.max(0, Math.min(59, Math.round(minute))) : 0;
      // Clearing lastAttemptDateLocal lets the scheduler fire at the new time
      // today if it hasn't already passed, and also allows the user to test
      // by setting a time a few minutes in the future.
      await patchBackupState({ backupHour: h, backupMinute: m, lastAttemptDateLocal: null });
      return { ok: true };
    }
  );

  /**
   * Called by the renderer each time a company DB is opened, so the backup
   * service knows which file to back up.
   */
  ipcMain.handle(
    IPC_ACTIONS.BACKUP_SET_DB_PATH,
    async (_, dbPath: unknown, companyName: unknown) => {
      await patchBackupState({
        currentDbPath: typeof dbPath === 'string' ? dbPath : null,
        currentCompanyName:
          typeof companyName === 'string' ? companyName : null,
      });
      return { ok: true };
    }
  );

  ipcMain.handle(IPC_ACTIONS.BACKUP_RUN_NOW, async () => {
    return await runBackupWithNotifications();
  });

  /**
   * Restores a .db.gz backup file: decompresses it and saves the raw SQLite DB
   * automatically to the user's Documents/Frappe Books folder.
   * The destination path is returned to the renderer so it can load the company.
   */
  ipcMain.handle(
    IPC_ACTIONS.BACKUP_RESTORE_FILE,
    async (_, backupGzPath: unknown) => {
      if (typeof backupGzPath !== 'string') {
        return { ok: false, error: 'Invalid arguments.' };
      }
      try {
        // Derive a safe destination filename from the archive name.
        // e.g. "backup-2026-05-02-143000.db.gz" → "backup-2026-05-02-143000.db"
        const baseName = path.basename(backupGzPath).replace(/\.gz$/i, '');
        const docsDir = path.join(app.getPath('documents'), 'EDukan');
        await fs.ensureDir(docsDir);
        const destPath = path.join(docsDir, baseName);

        await restoreBackupFile(backupGzPath, destPath);
        return { ok: true, destPath };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  );
}
