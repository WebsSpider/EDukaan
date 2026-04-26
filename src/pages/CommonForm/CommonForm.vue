<template>
  <FormContainer :use-full-width="useFullWidth">
    <template v-if="hasDoc" #header-left>
      <Barcode
        v-if="canShowBarcode"
        class="h-8"
        @item-selected="(name:string) => {
          // @ts-ignore
          doc?.addItem(name);
        }"
      />
      <ExchangeRate
        v-if="canShowExchangeRate"
        :disabled="doc?.isSubmitted || doc?.isCancelled"
        :from-currency="fromCurrency"
        :to-currency="toCurrency"
        :exchange-rate="exchangeRate"
        @change="
          async (exchangeRate: number) =>
            await doc.set('exchangeRate', exchangeRate)
        "
      />
      <p
        v-if="schema.label && !(canShowBarcode || canShowExchangeRate)"
        class="text-xl font-semibold items-center text-gray-600"
      >
        {{ schema.label }}
      </p>
    </template>
    <template v-if="hasDoc" #header>
      <Button
        v-if="canShowLinks"
        :icon="true"
        :title="t`View linked entries`"
        @click="showLinks = true"
      >
        <feather-icon name="link" class="w-4 h-4"></feather-icon>
      </Button>
      <Button
        v-if="canPrint"
        ref="printButton"
        :icon="true"
        :title="t`Open Print View`"
        @click="routeTo(`/print/${doc.schemaName}/${doc.name}`)"
      >
        <feather-icon name="printer" class="w-4 h-4"></feather-icon>
      </Button>
      <Button
        :icon="true"
        :title="t`Toggle between form and full width`"
        @click="toggleWidth"
      >
        <feather-icon
          :name="useFullWidth ? 'minimize' : 'maximize'"
          class="w-4 h-4"
        ></feather-icon>
      </Button>
      <DropdownWithActions
        v-for="group of groupedActions"
        :key="group.label"
        :type="group.type"
        :actions="group.actions"
      >
        <p v-if="group.group">
          {{ group.group }}
        </p>
        <feather-icon v-else name="more-horizontal" class="w-4 h-4" />
      </DropdownWithActions>
      <Button v-if="doc?.canSave" type="primary" @click="sync">
        {{ t`Save` }}
      </Button>
      <Button v-else-if="doc?.canSubmit" type="primary" @click="submit">{{
        t`Submit`
      }}</Button>
    </template>
    <template #body>
      <FormHeader
        :form-title="title"
        class="
          sticky
          top-0
          bg-white
          dark:bg-gray-890
          border-b
          dark:border-gray-800
        "
      >
        <StatusPill v-if="hasDoc" :doc="doc" />
      </FormHeader>

      <!-- Section Container -->
      <div
        v-if="hasDoc"
        class="overflow-auto custom-scroll custom-scroll-thumb1"
      >
        <div
          v-for="([n, fields], idx) in activeGroup.entries()"
          :key="n + idx"
          :class="
            idx !== 0 && activeGroup.size > 1
              ? 'border-t dark:border-gray-800'
              : ''
          "
        >
          <div
            v-if="showUserModuleBulkActions(n)"
            class="flex flex-wrap gap-2 px-4 pt-4"
          >
            <Button type="secondary" @click="setAllUserModules(true)">
              {{ t`Select all` }}
            </Button>
            <Button type="secondary" @click="setAllUserModules(false)">
              {{ t`Unselect all` }}
            </Button>
          </div>
          <CommonFormSection
            ref="section"
            class="p-4"
            :show-title="activeGroup.size > 1 && n !== t`Default`"
            :title="n"
            :fields="fields"
            :doc="doc"
            :errors="errors"
            @editrow="(doc: Doc) => showRowEditForm(doc)"
            @value-change="onValueChange"
            @row-change="updateGroupedFields"
          />
        </div>
      </div>

      <!-- Tab Bar -->
      <div
        v-if="groupedFields && groupedFields.size > 1"
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
          dark:bg-gray-875
        "
      >
        <div
          v-for="key of groupedFields.keys()"
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
          {{ key }}
        </div>
      </div>
    </template>
    <template #quickedit>
      <Transition name="quickedit">
        <LinkedEntries
          v-if="showLinks && canShowLinks"
          :doc="doc"
          @close="showLinks = false"
        />
      </Transition>
      <Transition name="quickedit">
        <RowEditForm
          v-if="row && !showLinks"
          :doc="doc"
          :fieldname="row.fieldname"
          :index="row.index"
          @previous="(i:number) => row!.index = i"
          @next="(i:number) => row!.index = i"
          @close="() => (row = null)"
        />
      </Transition>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { DEFAULT_CURRENCY } from 'fyo/utils/consts';
import { ValidationError } from 'fyo/utils/errors';
import { getDocStatus } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { Field, Schema } from 'schemas/types';
import Button from 'src/components/Button.vue';
import Barcode from 'src/components/Controls/Barcode.vue';
import ExchangeRate from 'src/components/Controls/ExchangeRate.vue';
import DropdownWithActions from 'src/components/DropdownWithActions.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import StatusPill from 'src/components/StatusPill.vue';
import { getErrorMessage } from 'src/utils';
import { shortcutsKey } from 'src/utils/injectionKeys';
import { docsPathMap } from 'src/utils/misc';
import { docsPathRef } from 'src/utils/refs';
import { ActionGroup, DocRef, UIGroupedFields } from 'src/utils/types';
import {
  commonDocSubmit,
  commonDocSync,
  getDocFromNameIfExistsElseNew,
  getFieldsGroupedByTabAndSection,
  getFormRoute,
  getGroupedActionsForDoc,
  isPrintable,
  routeTo,
} from 'src/utils/ui';
import { useDocShortcuts } from 'src/utils/vueUtils';
import { computed, defineComponent, inject, nextTick, ref } from 'vue';
import CommonFormSection from './CommonFormSection.vue';
import LinkedEntries from './LinkedEntries.vue';
import RowEditForm from './RowEditForm.vue';

const USER_MODULE_ACCESS_FIELDNAMES = [
  'canAccessGetStarted',
  'canAccessDashboard',
  'canAccessSales',
  'canAccessPurchases',
  'canAccessCommon',
  'canAccessReports',
  'canAccessInventory',
  'canAccessPOS',
  'canAccessSetup',
] as const;

export default defineComponent({
  components: {
    FormContainer,
    FormHeader,
    CommonFormSection,
    Button,
    DropdownWithActions,
    Barcode,
    ExchangeRate,
    LinkedEntries,
    RowEditForm,
    StatusPill,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  props: {
    name: { type: String, default: '' },
    schemaName: { type: String, default: ModelNameEnum.SalesInvoice },
  },
  setup() {
    const shortcuts = inject(shortcutsKey);
    const docOrNull = ref(null) as DocRef;
    let context = 'CommonForm';
    if (shortcuts) {
      context = useDocShortcuts(shortcuts, docOrNull, 'CommonForm', true);
    }

    return {
      docOrNull,
      shortcuts,
      context,
      printButton: ref<InstanceType<typeof Button> | null>(null),
    };
  },
  data() {
    return {
      errors: {},
      activeTab: this.t`Default`,
      groupedFields: null,
      isPrintable: false,
      showLinks: false,
      useFullWidth: false,
      row: null,
      quickItem: '',
      quickQty: 1,
      quickRate: null,
      itemOptions: [],
    } as {
      errors: Record<string, string>;
      activeTab: string;
      groupedFields: null | UIGroupedFields;
      isPrintable: boolean;
      showLinks: boolean;
      useFullWidth: boolean;
      row: null | { index: number; fieldname: string };
      quickItem: string;
      quickQty: number;
      quickRate: number | null;
      itemOptions: { name: string; itemCode?: string; barcode?: string }[];
    };
  },
  computed: {
    canShowQuickEntry(): boolean {
      return (
        this.hasDoc &&
        ['SalesInvoice', 'PurchaseInvoice'].includes(this.schemaName) &&
        this.doc.canEdit
      );
    },
    quickItemOptions(): { label: string; value: string }[] {
      const query = this.quickItem.trim().toLowerCase();
      const list = this.itemOptions.map((item) => ({
        label: item.itemCode ? `${item.name} (${item.itemCode})` : item.name,
        value: item.name,
      }));
      if (!query) {
        return list;
      }

      return list.filter(({ label, value }) => {
        const matched = this.itemOptions.find((i) => i.name === value);
        const code = matched?.itemCode?.toLowerCase() ?? '';
        const barcode = matched?.barcode?.toLowerCase() ?? '';
        return (
          label.toLowerCase().includes(query) ||
          code.includes(query) ||
          barcode.includes(query)
        );
      });
    },
    canShowBarcode(): boolean {
      if (!this.fyo.singles.InventorySettings?.enableBarcodes) {
        return false;
      }

      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.isSubmitted || this.doc.isCancelled) {
        return false;
      }

      // @ts-ignore
      return typeof this.doc?.addItem === 'function';
    },
    canShowExchangeRate(): boolean {
      return this.hasDoc && !!this.doc.isMultiCurrency;
    },
    exchangeRate(): number {
      if (!this.hasDoc || typeof this.doc.exchangeRate !== 'number') {
        return 1;
      }

      return this.doc.exchangeRate;
    },
    fromCurrency(): string {
      const currency = this.doc?.currency;
      if (typeof currency !== 'string') {
        return this.toCurrency;
      }

      return currency;
    },
    toCurrency(): string {
      const currency = this.fyo.singles.SystemSettings?.currency;
      if (typeof currency !== 'string') {
        return DEFAULT_CURRENCY;
      }

      return currency;
    },
    canPrint(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      return !this.doc.isCancelled && !this.doc.dirty && this.isPrintable;
    },
    canShowLinks(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      if (this.doc.schema.isSubmittable && !this.doc.isSubmitted) {
        return false;
      }

      return this.doc.inserted;
    },
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    status(): string {
      if (!this.hasDoc) {
        return '';
      }

      return getDocStatus(this.doc);
    },
    doc(): Doc {
      const doc = this.docOrNull;
      if (!doc) {
        throw new ValidationError(
          this.t`Doc ${this.schema.label} ${this.name} not set`
        );
      }
      return doc;
    },
    title(): string {
      if (this.schema.isSubmittable && this.docOrNull?.notInserted) {
        return this.t`New Entry`;
      }

      return this.docOrNull?.name || this.t`New Entry`;
    },
    schema(): Schema {
      const schema = this.fyo.schemaMap[this.schemaName];
      if (!schema) {
        throw new ValidationError(`no schema found with ${this.schemaName}`);
      }

      return schema;
    },
    activeGroup(): Map<string, Field[]> {
      if (!this.groupedFields) {
        return new Map();
      }

      const group = this.groupedFields.get(this.activeTab);
      if (!group) {
        const tab = [...this.groupedFields.keys()][0];
        return this.groupedFields.get(tab) ?? new Map<string, Field[]>();
      }

      return group;
    },
    groupedActions(): ActionGroup[] {
      if (!this.hasDoc) {
        return [];
      }

      return getGroupedActionsForDoc(this.doc);
    },
  },
  beforeMount() {
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
  },
  async mounted() {
    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.cf = this;
    }

    await this.setDoc();
    this.replacePathAfterSync();
    this.updateGroupedFields();
    if (this.groupedFields) {
      this.activeTab = [...this.groupedFields.keys()][0];
    }
    this.isPrintable = await isPrintable(this.schemaName);
    await this.loadItemOptions();
  },
  activated(): void {
    this.useFullWidth = !!this.fyo.singles.Misc?.useFullWidth;
    docsPathRef.value = docsPathMap[this.schemaName] ?? '';
    this.shortcuts?.pmod.set(this.context, ['KeyP'], () => {
      if (!this.canPrint) {
        return;
      }

      this.printButton?.$el.click();
    });
    this.shortcuts?.pmod.set(this.context, ['KeyL'], () => {
      if (!this.canShowLinks && !this.showLinks) {
        return;
      }

      this.showLinks = !this.showLinks;
    });
  },
  deactivated(): void {
    docsPathRef.value = '';
    this.showLinks = false;
    this.row = null;
  },
  methods: {
    showUserModuleBulkActions(sectionName: string): boolean {
      return (
        this.schemaName === ModelNameEnum.User &&
        sectionName === 'Modules' &&
        this.hasDoc &&
        this.doc.canEdit
      );
    },
    async setAllUserModules(enabled: boolean): Promise<void> {
      if (!this.hasDoc || this.schemaName !== ModelNameEnum.User) {
        return;
      }

      for (const fieldname of USER_MODULE_ACCESS_FIELDNAMES) {
        try {
          await this.doc.set(fieldname, enabled);
        } catch (err) {
          if (!(err instanceof Error)) {
            return;
          }

          this.errors[fieldname] = getErrorMessage(err, this.doc);
        }
      }

      this.updateGroupedFields();
    },
    routeTo,
    async toggleWidth() {
      const value = !this.useFullWidth;
      await this.fyo.singles.Misc?.setAndSync('useFullWidth', value);
      this.useFullWidth = value;
    },
    updateGroupedFields(): void {
      if (!this.hasDoc) {
        return;
      }

      this.groupedFields = getFieldsGroupedByTabAndSection(
        this.schema,
        this.doc
      );
    },
    async sync(useDialog?: boolean) {
      if (await commonDocSync(this.doc, useDialog)) {
        this.updateGroupedFields();
      }
    },
    async submit() {
      if (await commonDocSubmit(this.doc)) {
        this.updateGroupedFields();
      }
    },
    async setDoc() {
      if (this.hasDoc) {
        return;
      }

      this.docOrNull = await getDocFromNameIfExistsElseNew(
        this.schemaName,
        this.name
      );
    },
    replacePathAfterSync() {
      if (!this.hasDoc || this.doc.inserted) {
        return;
      }

      this.doc.once('afterSync', async () => {
        const route = getFormRoute(this.schemaName, this.doc.name!);
        await this.$router.replace(route);
      });
    },
    async showRowEditForm(doc: Doc) {
      if (this.showLinks) {
        this.showLinks = false;
        await nextTick();
      }

      const index = doc.idx;
      const fieldname = doc.parentFieldname;

      if (typeof index === 'number' && typeof fieldname === 'string') {
        this.row = { index, fieldname };
      }
    },
    async onValueChange(field: Field, value: DocValue) {
      const { fieldname } = field;
      delete this.errors[fieldname];

      try {
        await this.doc.set(fieldname, value);
      } catch (err) {
        if (!(err instanceof Error)) {
          return;
        }

        this.errors[fieldname] = getErrorMessage(err, this.doc);
      }

      this.updateGroupedFields();
    },
    async loadItemOptions() {
      if (!['SalesInvoice', 'PurchaseInvoice'].includes(this.schemaName)) {
        return;
      }

      this.itemOptions = (await this.fyo.db.getAll('Item', {
        fields: ['name', 'itemCode', 'barcode'],
      })) as { name: string; itemCode?: string; barcode?: string }[];
    },
    async quickAddItem() {
      if (!this.quickItem.trim()) {
        return;
      }

      const key = this.quickItem.trim().toLowerCase();
      const match =
        this.itemOptions.find((i) => i.name.toLowerCase() === key) ??
        this.itemOptions.find((i) => i.itemCode?.toLowerCase() === key) ??
        this.itemOptions.find((i) => i.barcode?.toLowerCase() === key);

      if (!match || typeof this.doc.addItem !== 'function') {
        return;
      }

      await this.doc.addItem(match.name);
      const row = this.doc.items?.at(-1);
      if (row) {
        if (this.quickQty > 0) {
          await row.set('quantity', this.quickQty);
        }
        if (typeof this.quickRate === 'number' && this.quickRate >= 0) {
          await row.set('rate', this.fyo.pesa(this.quickRate));
        }
      }

      this.quickItem = '';
      this.quickQty = 1;
      this.quickRate = null;
      this.updateGroupedFields();
    },
  },
});
</script>
