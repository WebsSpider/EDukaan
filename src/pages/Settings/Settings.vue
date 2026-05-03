<template>
  <FormContainer>
    <template #header>
      <Button v-if="canSave" type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
    </template>
    <template #body>
      <FormHeader
        :form-title="tabLabels[activeTab] ?? ''"
        :form-sub-title="t`Settings`"
        class="
          sticky
          top-0
          bg-white
          dark:bg-gray-890
          border-b
          dark:border-gray-800
        "
      >
      </FormHeader>

      <!-- Section Container -->
      <div v-if="doc" class="overflow-auto custom-scroll custom-scroll-thumb1">
        <CommonFormSection
          v-for="([name, fields], idx) in activeGroup.entries()"
          :key="name + idx"
          ref="section"
          class="p-4"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t dark:border-gray-800'
              : ''
          "
          :show-title="activeGroup.size > 1 && name !== t`Default`"
          :title="name"
          :fields="fields"
          :doc="doc"
          :errors="errors"
          @value-change="onValueChange"
        />
      </div>
      <div
        v-else-if="activeTab === LICENSE_TAB"
        class="overflow-auto custom-scroll custom-scroll-thumb1 p-4 space-y-4"
      >
        <div
          v-if="licenseStatusMessage"
          class="
            text-sm text-red-700
            dark:text-red-300
            bg-red-50
            dark:bg-red-900/30
            border border-red-300
            dark:border-red-800
            rounded
            p-3
          "
        >
          {{ licenseStatusMessage }}
        </div>

        <div class="rounded border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-700 dark:text-gray-200 mb-1">
            {{ t`Current license mode` }}:
            <strong>{{ licenseModeLabel }}</strong>
          </p>
          <p class="text-sm text-gray-700 dark:text-gray-200">
            {{ t`Expiry timestamp` }}:
            <strong>{{ licenseExpiryLabel }}</strong>
          </p>
        </div>

        <div class="rounded border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-3">
            {{ t`Activate via key (Internet is required)` }}
          </p>
          <input
            v-model="licenseKey"
            type="text"
            class="
              w-full
              p-2
              border
              rounded
              bg-white
              text-gray-900
              border-gray-300
              dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600
            "
            :placeholder="t`Enter your license key`"
            @keydown.enter="activateViaKey"
          />
          <Button
            type="primary"
            class="mt-3"
            :disabled="licenseSubmitting"
            @click="activateViaKey"
          >
            {{ t`Activate License Key` }}
          </Button>
        </div>

        <div class="rounded border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm font-medium text-gray-800 dark:text-gray-100 mb-3">
            {{ t`Activate via signed license file (Offline)` }}
          </p>
          <Button
            type="secondary"
            :disabled="licenseSubmitting"
            @click="activateViaFile"
          >
            {{ t`Upload License File` }}
          </Button>
        </div>
      </div>

      <div
        v-else-if="activeTab === BACKUP_TAB"
        class="overflow-auto custom-scroll custom-scroll-thumb1 p-4 space-y-4"
      >
        <!-- Not configured -->
        <div v-if="!backupConfigured" class="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-4">
          <p class="text-sm text-amber-800 dark:text-amber-200">
            {{ t`BackBlaze B2 backup is not configured on this build. Contact your administrator.` }}
          </p>
        </div>

        <!-- No backup license -->
        <div v-else-if="!backupLicensed" class="rounded border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            {{ t`Cloud backup is not included in your current license. Upgrade your license to enable automatic BackBlaze B2 backups.` }}
          </p>
        </div>

        <!-- Configured and licensed -->
        <template v-else>
          <!-- Status card -->
          <div :class="[
            'rounded border p-4 space-y-2',
            backupStatus === 'success'
              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
              : backupStatus === 'error'
              ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
              : backupStatus === 'offline'
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
              : 'border-gray-200 dark:border-gray-700'
          ]">
            <p class="flex items-center gap-2">
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ t`Status` }}</span>
              <strong :class="[
                'text-base font-semibold',
                backupStatus === 'success' ? 'text-green-600 dark:text-green-400' :
                backupStatus === 'error'   ? 'text-red-500 dark:text-red-400'     :
                backupStatus === 'offline' ? 'text-amber-500 dark:text-amber-400' :
                'text-gray-500 dark:text-gray-400'
              ]">{{ backupStatusLabel }}</strong>
            </p>
            <p v-if="backupLastSuccess" class="text-sm text-gray-600 dark:text-gray-300">
              {{ t`Last successful backup` }}: <strong>{{ backupLastSuccess }}</strong>
            </p>
            <p v-if="backupError" class="text-sm text-red-600 dark:text-red-400 break-all">
              {{ t`Error` }}: {{ backupError }}
            </p>
          </div>

          <!-- Backup time scheduler -->
          <div class="rounded border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
              {{ t`Daily backup time` }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t`Next automatic backup` }}:
              <strong class="text-gray-800 dark:text-gray-100">{{ nextBackupLabel }}</strong>
            </p>
            <!-- Single-row time picker: Hour : Minute  AM/PM  [Update] -->
            <div class="flex items-center gap-2">
              <!-- Hour 1–12 -->
              <select
                v-model.number="backupHour12"
                class="w-16 p-2 border rounded bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 text-center"
              >
                <option v-for="h in 12" :key="h" :value="h">{{ String(h).padStart(2, '0') }}</option>
              </select>

              <span class="text-gray-500 dark:text-gray-400 font-semibold text-lg select-none">:</span>

              <!-- Minute 00–59 -->
              <select
                v-model.number="backupMinute"
                class="w-16 p-2 border rounded bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 text-center"
              >
                <option v-for="m in minuteOptions" :key="m" :value="m">{{ String(m).padStart(2, '0') }}</option>
              </select>

              <!-- AM / PM -->
              <select
                v-model="backupAmPm"
                class="w-20 p-2 border rounded bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 text-center"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>

              <!-- Update button -->
              <Button
                type="primary"
                :disabled="!backupTimeChanged"
                @click="saveBackupTime"
              >
                {{ t`Update` }}
              </Button>
            </div>
            <p v-if="backupTimeSaved" class="text-xs text-green-600 dark:text-green-400">
              {{ t`Backup time updated.` }}
            </p>
          </div>

          <!-- Manual run -->
          <div class="rounded border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
              {{ t`Manual Backup` }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t`Run a backup right now and upload it to Cloud.` }}
            </p>
            <p v-if="backupUsedToday && !backupRunning" class="text-xs text-amber-600 dark:text-amber-400">
              {{ t`A backup has already been run today. Manual backup will be available again tomorrow.` }}
            </p>
            <Button
              type="primary"
              :disabled="backupRunning || backupUsedToday"
              @click="runBackupNow"
            >
              {{ backupRunning ? t`Backing up…` : t`Backup Now` }}
            </Button>
          </div>
        </template>
      </div>
      <div
        v-if="settingsTabKeys.length > 1"
        class="
          mt-auto
          px-4
          pb-4
          flex
          gap-8
          border-t
          dark:border-gray-800
          flex-shrink-0
          sticky
          bottom-0
          bg-white
          dark:bg-gray-890
        "
      >
        <div
          v-for="key of settingsTabKeys"
          :key="key"
          class="text-sm cursor-pointer"
          :class="
            key === activeTab
              ? 'text-gray-900 dark:text-gray-25 font-semibold border-t-2 border-gray-800 dark:border-gray-100'
              : 'text-gray-700 dark:text-gray-200 '
          "
          :style="{
            paddingTop: key === activeTab ? 'calc(1rem - 2px)' : '1rem',
          }"
          @click="activeTab = key"
        >
          {{ tabLabels[key] }}
        </div>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { handleErrorWithDialog } from 'src/errorHandling';
import { getErrorMessage } from 'src/utils';
import { evaluateHidden } from 'src/utils/doc';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { showDialog } from 'src/utils/interactive';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { UIGroupedFields } from 'src/utils/types';
import { computed, defineComponent, inject } from 'vue';
import type { LicenseGetStatusResult } from 'utils/license/types';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

const COMPONENT_NAME = 'Settings';
const LICENSE_TAB = '__license__';
const BACKUP_TAB = '__backup__';
export default defineComponent({
  components: { FormContainer, Button, FormHeader, CommonFormSection },
  provide() {
    return { doc: computed(() => this.doc) };
  },
  setup() {
    return {
      shortcuts: inject(shortcutsKey),
    };
  },
  data() {
    return {
      errors: {},
      activeTab: ModelNameEnum.AccountingSettings,
      groupedFields: null,
      licenseKey: '',
      licenseSubmitting: false,
      licenseStatusMessage: '',
      licenseExpiryLabel: '-',
      licenseModeLabel: '-',
      // Backup tab
      backupConfigured: false,
      backupLicensed: false,
      backupStatus: 'idle' as string,
      backupLastSuccess: '' as string,
      backupError: '' as string,
      /** 12-hour clock picker values */
      backupHour12: 2,
      backupMinute: 0,
      backupAmPm: 'AM' as 'AM' | 'PM',
      /** Saved values (24h) — used to detect unsaved changes */
      savedBackupHour: 2,
      savedBackupMinute: 0,
      backupRunning: false,
      backupTimeSaved: false,
      lastAttemptDateLocal: null as string | null,
      lastSuccessDateLocal: null as string | null,
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      licenseKey: string;
      licenseSubmitting: boolean;
      licenseStatusMessage: string;
      licenseExpiryLabel: string;
      licenseModeLabel: string;
      backupConfigured: boolean;
      backupLicensed: boolean;
      backupStatus: string;
      backupLastSuccess: string;
      backupError: string;
      backupHour12: number;
      backupMinute: number;
      backupAmPm: 'AM' | 'PM';
      savedBackupHour: number;
      savedBackupMinute: number;
      backupRunning: boolean;
      backupTimeSaved: boolean;
      lastAttemptDateLocal: string | null;
      lastSuccessDateLocal: string | null;
    };
  },
  computed: {
    LICENSE_TAB() {
      return LICENSE_TAB;
    },
    BACKUP_TAB() {
      return BACKUP_TAB;
    },
    canSave() {
      if (this.activeTab === LICENSE_TAB || this.activeTab === BACKUP_TAB) {
        return false;
      }
      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.ERPNextSyncSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ].some((s) => this.fyo.singles[s]?.canSave);
    },
    doc(): Doc | null {
      const doc = this.fyo.singles[this.activeTab];
      if (!doc) {
        return null;
      }

      return doc;
    },    tabLabels(): Record<string, string> {
      return {
        [ModelNameEnum.AccountingSettings]: this.t`General`,
        [ModelNameEnum.PrintSettings]: this.t`Print`,
        [ModelNameEnum.InventorySettings]: this.t`Inventory`,
        [ModelNameEnum.Defaults]: this.t`Defaults`,
        [ModelNameEnum.POSSettings]: this.t`POS Settings`,
        [ModelNameEnum.ERPNextSyncSettings]: this.t`ERPNext Sync`,
        [ModelNameEnum.SystemSettings]: this.t`System`,
        [LICENSE_TAB]: this.t`License`,
        [BACKUP_TAB]: this.t`Backup`,
      };
    },
    schemas(): Schema[] {
      const enableInventory =
        !!this.fyo.singles.AccountingSettings?.enableInventory;
      const enablePOS = !!this.fyo.singles.InventorySettings?.enablePointOfSale;
      const enableERPNextSync =
        !!this.fyo.singles.AccountingSettings?.enableERPNextSync;

      return [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.ERPNextSyncSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
      ]
        .filter((s) => {
          if (s === ModelNameEnum.InventorySettings && !enableInventory) {
            return false;
          }

          if (s === ModelNameEnum.POSSettings && !enablePOS) {
            return false;
          }

          if (s === ModelNameEnum.ERPNextSyncSettings && !enableERPNextSync) {
            return false;
          }

          return true;
        })
        .map((s) => this.fyo.schemaMap[s])
        .filter((s): s is Schema => !!s);
    },
    settingsTabKeys(): string[] {
      const enableInventory =
        !!this.fyo.singles.AccountingSettings?.enableInventory;
      const enablePOS =
        !!this.fyo.singles.InventorySettings?.enablePointOfSale;
      const enableERPNextSync =
        !!this.fyo.singles.AccountingSettings?.enableERPNextSync;

      const keys = [
        ModelNameEnum.AccountingSettings,
        ModelNameEnum.InventorySettings,
        ModelNameEnum.Defaults,
        ModelNameEnum.POSSettings,
        ModelNameEnum.ERPNextSyncSettings,
        ModelNameEnum.PrintSettings,
        ModelNameEnum.SystemSettings,
        LICENSE_TAB,
        BACKUP_TAB,
      ];

      return keys.filter((s) => {
        if (s === LICENSE_TAB) {
          return true;
        }
        if (s === ModelNameEnum.InventorySettings && !enableInventory) {
          return false;
        }

        if (s === ModelNameEnum.POSSettings && !enablePOS) {
          return false;
        }

        if (s === ModelNameEnum.ERPNextSyncSettings && !enableERPNextSync) {
          return false;
        }

        return true;
      });
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        throw new ValidationError(
          `Tab group ${this.activeTab} has no value set`
        );
      }

      return group;
    },
    backupStatusLabel(): string {
      const map: Record<string, string> = {
        idle: this.t`Idle`,
        running: this.t`Running…`,
        success: this.t`Success`,
        error: this.t`Error`,
        offline: this.t`Offline (upload skipped)`,
      };
      return map[this.backupStatus] ?? this.backupStatus;
    },
    backupTimeChanged(): boolean {
      const h24 =
        this.backupAmPm === 'AM'
          ? this.backupHour12 % 12
          : (this.backupHour12 % 12) + 12;
      return (
        h24 !== this.savedBackupHour ||
        this.backupMinute !== this.savedBackupMinute
      );
    },
    backupUsedToday(): boolean {
      if (!this.lastSuccessDateLocal) {
        return false;
      }
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
      return this.lastSuccessDateLocal === today;
    },
    minuteOptions(): number[] {
      const opts: number[] = [];
      for (let m = 0; m < 60; m++) {
        opts.push(m);
      }
      return opts;
    },
    nextBackupLabel(): string {
      const now = new Date();
      const h = this.savedBackupHour;
      const m = this.savedBackupMinute;

      const todayBackup = new Date(now);
      todayBackup.setHours(h, m, 0, 0);

      let next: Date;
      const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');

      if (this.lastAttemptDateLocal === todayStr || now >= todayBackup) {
        next = new Date(todayBackup);
        next.setDate(next.getDate() + 1);
      } else {
        next = todayBackup;
      }

      const isToday = next.toDateString() === now.toDateString();
      const isTomorrow =
        next.toDateString() ===
        new Date(now.getTime() + 86400000).toDateString();

      const timeStr = next.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (isToday) return `${this.t`Today`} ${this.t`at`} ${timeStr}`;
      if (isTomorrow) return `${this.t`Tomorrow`} ${this.t`at`} ${timeStr}`;
      return next.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    },
  },
  watch: {
    activeTab(value: string) {
      if (value === LICENSE_TAB) {
        void this.refreshLicenseStatus();
        return;
      }
      if (value === BACKUP_TAB) {
        void this.refreshBackupStatus();
        return;
      }
    },
  },
  mounted() {
    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.settings = this;
    }

    this.update();
  },
  activated(): void {
    const tab = this.$route.query.tab;
    if (typeof tab === 'string' && this.tabLabels[tab]) {
      this.activeTab = tab;
    }

    docsPathRef.value = docsPathMap.Settings ?? '';
    this.shortcuts?.pmod.set(COMPONENT_NAME, ['KeyS'], async () => {
      if (!this.canSave) {
        return;
      }

      await this.sync();
    });
  },
  async deactivated(): Promise<void> {
    docsPathRef.value = '';
    this.shortcuts?.delete(COMPONENT_NAME);
    if (!this.canSave) {
      return;
    }
    await this.reset();
  },
  methods: {
    decodeLicenseJson(raw: unknown): string | null {
      const enc = new TextDecoder('utf-8');
      const enc16 = new TextDecoder('utf-16le');
      const toBytes = (input: unknown): Uint8Array | null => {
        if (input instanceof Uint8Array) {
          return input;
        }
        if (typeof input === 'string') {
          return new TextEncoder().encode(input);
        }
        if (
          input &&
          typeof input === 'object' &&
          'type' in input &&
          'data' in input &&
          (input as { type?: unknown }).type === 'Buffer' &&
          Array.isArray((input as { data?: unknown }).data)
        ) {
          return Uint8Array.from((input as { data: number[] }).data);
        }
        return null;
      };
      const bytes = toBytes(raw);
      if (!bytes) {
        return null;
      }
      const attempts = [
        enc.decode(bytes),
        enc16.decode(bytes),
        enc.decode(bytes).replace(/\u0000/g, ''),
      ];
      for (const attempt of attempts) {
        const normalized = attempt.replace(/^\uFEFF/, '').trim();
        if (!normalized) {
          continue;
        }
        try {
          JSON.parse(normalized);
          return normalized;
        } catch {
          // Try next decoding fallback.
        }
      }
      return null;
    },
    async refreshLicenseStatus(): Promise<void> {
      const status: LicenseGetStatusResult = await ipc.license.getStatus();
      this.licenseStatusMessage = status.licenseServerMessage ?? '';
      this.licenseModeLabel =
        status.mode === 'trial'
          ? this.t`Trial`
          : status.mode === 'licensed'
          ? this.t`Licensed`
          : this.t`Not activated`;
      this.licenseExpiryLabel = status.licenseExpiryAtIso
        ? new Date(status.licenseExpiryAtIso).toLocaleString()
        : this.t`Not available`;
    },
    async activateViaKey(): Promise<void> {
      const key = this.licenseKey.trim();
      if (key.length < 4) {
        this.licenseStatusMessage = this.t`Please enter a valid license key.`;
        return;
      }
      this.licenseSubmitting = true;
      this.licenseStatusMessage = '';
      try {
        const companyName = (this.fyo.singles.AccountingSettings?.companyName ??
          '') as string;
        const result = await ipc.license.submitLicenseKey(key, companyName);
        if (!result.success) {
          this.licenseStatusMessage = result.error;
          return;
        }
        this.licenseStatusMessage = this.t`License activated successfully.`;
        this.licenseKey = '';
        await this.refreshLicenseStatus();
        window.dispatchEvent(new Event('edukan:license-updated'));
      } finally {
        this.licenseSubmitting = false;
      }
    },
    async activateViaFile(): Promise<void> {
      this.licenseSubmitting = true;
      this.licenseStatusMessage = '';
      try {
        const selected = await ipc.selectFile({
          title: this.t`Select license file`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (selected.canceled || !selected.success) {
          return;
        }
        const rawJson = this.decodeLicenseJson(selected.data);
        if (!rawJson) {
          this.licenseStatusMessage = this.t`Invalid JSON file.`;
          return;
        }
        const result = await ipc.license.installJson(rawJson);
        if (!result.success) {
          this.licenseStatusMessage = result.error;
          return;
        }
        this.licenseStatusMessage = this
          .t`License file activated successfully.`;
        await this.refreshLicenseStatus();
        window.dispatchEvent(new Event('edukan:license-updated'));
      } finally {
        this.licenseSubmitting = false;
      }
    },
    async reset() {
      const resetableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.dirty) as Doc[];

      for (const doc of resetableDocs) {
        await doc.load();
      }

      this.update();
    },
    // Backup methods
    async refreshBackupStatus(): Promise<void> {
      this.backupConfigured = await ipc.backup.isConfigured();
      if (!this.backupConfigured) {
        return;
      }

      const licStatus = await ipc.license.getStatus();
      this.backupLicensed = Array.isArray(licStatus.features)
        ? licStatus.features.includes('backup')
        : false;

      if (!this.backupLicensed) {
        return;
      }

      const state = await ipc.backup.getStatus();
      this.backupStatus = state.lastStatus ?? 'idle';
      const h24 = typeof state.backupHour === 'number' ? state.backupHour : 2;
      this.backupMinute = typeof state.backupMinute === 'number' ? state.backupMinute : 0;
      this.savedBackupHour = h24;
      this.savedBackupMinute = this.backupMinute;
      // Derive 12-hour picker values from the stored 24-hour value
      this.backupHour12 = h24 % 12 === 0 ? 12 : h24 % 12;
      this.backupAmPm = h24 < 12 ? 'AM' : 'PM';
      this.lastAttemptDateLocal = state.lastAttemptDateLocal ?? null;
      this.lastSuccessDateLocal = state.lastSuccessDateLocal ?? null;
      this.backupLastSuccess = state.lastSuccessAtIso
        ? new Date(state.lastSuccessAtIso).toLocaleString()
        : '';
      this.backupError = state.lastErrorMessage ?? '';
    },
    async saveBackupTime(): Promise<void> {
      const h24 =
        this.backupAmPm === 'AM'
          ? this.backupHour12 % 12
          : (this.backupHour12 % 12) + 12;
      await ipc.backup.setTime(h24, this.backupMinute);
      this.savedBackupHour = h24;
      this.savedBackupMinute = this.backupMinute;
      this.backupTimeSaved = true;
      setTimeout(() => { this.backupTimeSaved = false; }, 3000);
    },
    async runBackupNow(): Promise<void> {
      this.backupRunning = true;
      this.backupError = '';
      try {
        const res = await ipc.backup.runNow();
        if (!res.ok) {
          this.backupError = res.error ?? this.t`Unknown error`;
          this.backupStatus = 'error';
        } else {
          this.backupStatus = 'success';
          this.backupLastSuccess = new Date().toLocaleString();
        }
        // Refresh persisted state so backupUsedToday reflects the attempt
        const state = await ipc.backup.getStatus();
        this.lastAttemptDateLocal = state.lastAttemptDateLocal ?? null;
      } finally {
        this.backupRunning = false;
      }
    },
    async sync(): Promise<void> {
      const syncableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.canSave) as Doc[];

      for (const doc of syncableDocs) {
        await this.syncDoc(doc);
      }

      this.update();
      await showDialog({
        title: this.t`Reload EDukan?`,
        detail: this.t`Changes made to settings will be visible on reload.`,
        type: 'info',
        buttons: [
          {
            label: this.t`Yes`,
            isPrimary: true,
            action: ipc.reloadWindow.bind(ipc),
          },
          {
            label: this.t`No`,
            action: () => null,
            isEscape: true,
          },
        ],
      });
    },
    async syncDoc(doc: Doc): Promise<void> {
      try {
        await doc.sync();
        this.updateGroupedFields();
      } catch (error) {
        await handleErrorWithDialog(error, doc);
      }
    },
    async onValueChange(field: Field, value: DocValue): Promise<void> {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc?.set(fieldname, value ?? '');
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc ?? undefined);
      }

      this.update();
    },
    update(): void {
      this.updateGroupedFields();
      if (this.activeTab === LICENSE_TAB) {
        void this.refreshLicenseStatus();
      }
      if (this.activeTab === BACKUP_TAB) {
        void this.refreshBackupStatus();
      }
    },
    updateGroupedFields(): void {
      const grouped: UIGroupedFields = new Map();
      const fields: Field[] = this.schemas.map((s) => s.fields).flat();

      for (const field of fields) {
        const schemaName = field.schemaName!;
        if (
          schemaName === ModelNameEnum.PrintSettings &&
          field.fieldname === 'defaultPrinter'
        ) {
          continue;
        }
        if (!grouped.has(schemaName)) {
          grouped.set(schemaName, new Map());
        }

        const tabbed = grouped.get(schemaName)!;
        const section = field.section ?? this.t`Miscellaneous`;
        if (!tabbed.has(section)) {
          tabbed.set(section, []);
        }

        if (field.meta) {
          continue;
        }

        const doc = this.fyo.singles[schemaName];
        if (evaluateHidden(field, doc)) {
          continue;
        }

        tabbed.get(section)!.push(field);
      }

      grouped.set(LICENSE_TAB, new Map());
      this.groupedFields = grouped;
    },
  },
});
</script>
