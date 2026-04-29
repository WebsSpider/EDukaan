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

      <!-- Tab Bar -->
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
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      licenseKey: string;
      licenseSubmitting: boolean;
      licenseStatusMessage: string;
      licenseExpiryLabel: string;
      licenseModeLabel: string;
    };
  },
  computed: {
    LICENSE_TAB() {
      return LICENSE_TAB;
    },
    canSave() {
      if (this.activeTab === LICENSE_TAB) {
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
    },
    tabLabels(): Record<string, string> {
      return {
        [ModelNameEnum.AccountingSettings]: this.t`General`,
        [ModelNameEnum.PrintSettings]: this.t`Print`,
        [ModelNameEnum.InventorySettings]: this.t`Inventory`,
        [ModelNameEnum.Defaults]: this.t`Defaults`,
        [ModelNameEnum.POSSettings]: this.t`POS Settings`,
        [ModelNameEnum.ERPNextSyncSettings]: this.t`ERPNext Sync`,
        [ModelNameEnum.SystemSettings]: this.t`System`,
        [LICENSE_TAB]: this.t`License`,
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
  },
  watch: {
    activeTab(value: string) {
      if (value === LICENSE_TAB) {
        void this.refreshLicenseStatus();
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
    async sync(): Promise<void> {
      const syncableDocs = this.schemas
        .map(({ name }) => this.fyo.singles[name])
        .filter((doc) => doc?.canSave) as Doc[];

      for (const doc of syncableDocs) {
        await this.syncDoc(doc);
      }

      this.update();
      await showDialog({
        title: this.t`Reload Frappe Books?`,
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
    },
    updateGroupedFields(): void {
      const grouped: UIGroupedFields = new Map();
      const fields: Field[] = this.schemas.map((s) => s.fields).flat();

      for (const field of fields) {
        const schemaName = field.schemaName!;
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
