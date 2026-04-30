<template>
  <FormContainer
    :show-header="false"
    class="justify-content items-center h-full py-3 sm:py-4"
    :class="{ 'window-drag': platform !== 'Windows' }"
  >
    <template #body>
      <div class="flex h-full min-h-0 flex-col overflow-hidden">
        <FormHeader
          :form-title="
            currentStep === 1 ? t`Set up your organization` : t`Create Admin User`
          "
          :form-sub-title="currentStep === 1 ? t`Step 1 of 2` : t`Step 2 of 2`"
          class="
            bg-white
            dark:bg-gray-890
            border-b
            dark:border-gray-800
            z-10
          "
        >
        </FormHeader>

        <!-- Section Container -->
        <div
          v-if="hasDoc"
          class="flex-1 min-h-0 overflow-auto custom-scroll custom-scroll-thumb1"
        >
          <CommonFormSection
            v-for="([name, fields], idx) in displayedGroup.entries()"
            :key="name + idx"
            ref="section"
            class="p-4"
            :class="
              idx !== 0 && displayedGroup.size > 1
                ? 'border-t dark:border-gray-800'
                : ''
            "
            :show-title="displayedGroup.size > 1 && name !== t`Default`"
            :title="name"
            :fields="fields"
            :doc="doc"
            :errors="errors"
            :collapsible="false"
            @value-change="onValueChange"
          />
        </div>

        <!-- Buttons Bar -->
        <div
          class="
            mt-auto
            p-4
            flex
            items-center
            justify-between
            border-t
            dark:border-gray-800
            flex-shrink-0
            bg-white
            dark:bg-gray-890
            z-10
          "
        >
          <p v-if="loading" class="text-base text-gray-600 dark:text-gray-400">
            {{ t`Loading instance...` }}
          </p>
          <Button
            v-if="!loading"
            class="w-24 border dark:border-gray-800"
            @click="cancel"
            >{{ t`Cancel` }}</Button
          >
          <Button
            v-if="fyo.store.isDevelopment && !loading"
            class="w-24 ml-auto mr-4 border dark:border-gray-800"
            :disabled="loading"
            @click="fill"
            >{{ t`Fill` }}</Button
          >
          <Button
            v-if="currentStep === 2 && !loading"
            class="w-24 border dark:border-gray-800 mr-4"
            :disabled="loading"
            @click="back"
            >{{ t`Back` }}</Button
          >
          <Button
            v-if="currentStep === 1"
            type="primary"
            class="w-24"
            data-testid="next-button"
            :disabled="!areCurrentStepValuesFilled || loading"
            @click="next"
            >{{ t`Next` }}</Button
          >
          <Button
            v-else
            type="primary"
            class="w-24"
            data-testid="submit-button"
            :disabled="!areCurrentStepValuesFilled || loading"
            @click="submit"
            >{{ t`Submit` }}</Button
          >
        </div>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { Verb } from 'fyo/telemetry/types';
import { TranslationString } from 'fyo/utils/translation';
import { ModelNameEnum } from 'models/types';
import { Field } from 'schemas/types';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import FormHeader from 'src/components/FormHeader.vue';
import { getErrorMessage } from 'src/utils';
import { showDialog } from 'src/utils/interactive';
import { getSetupWizardDoc } from 'src/utils/misc';
import { getFieldsGroupedByTabAndSection } from 'src/utils/ui';
import { computed, defineComponent } from 'vue';
import CommonFormSection from '../CommonForm/CommonFormSection.vue';

export default defineComponent({
  name: 'SetupWizard',
  components: {
    Button,
    FormContainer,
    FormHeader,
    CommonFormSection,
  },
  provide() {
    return {
      doc: computed(() => this.docOrNull),
    };
  },
  emits: ['setup-complete', 'setup-canceled'],
  data() {
    return {
      docOrNull: null,
      errors: {},
      loading: false,
      currentStep: 1,
    } as {
      errors: Record<string, string>;
      docOrNull: null | Doc;
      loading: boolean;
      currentStep: 1 | 2;
    };
  },
  computed: {
    hasDoc(): boolean {
      return this.docOrNull instanceof Doc;
    },
    doc(): Doc {
      if (this.docOrNull instanceof Doc) {
        return this.docOrNull;
      }

      throw new Error(`Doc is null`);
    },
    stepFieldNames(): string[] {
      return this.currentStep === 1
        ? [
            'logo',
            'companyName',
            'fullname',
            'email',
            'phone',
            'country',
            'currency',
            'bankName',
            'chartOfAccounts',
            'fiscalYearStart',
            'fiscalYearEnd',
          ]
        : ['adminUsername', 'adminPassword', 'confirmAdminPassword'];
    },
    areCurrentStepValuesFilled(): boolean {
      if (!this.hasDoc) {
        return false;
      }

      const values = this.doc.schema.fields
        .filter(
          (f) => f.required && this.stepFieldNames.includes(f.fieldname as string)
        )
        .map((f) => this.doc[f.fieldname]);

      return values.every(Boolean);
    },
    displayedGroup(): Map<string, Field[]> {
      if (!this.hasDoc) {
        return new Map();
      }

      const groupedFields = getFieldsGroupedByTabAndSection(
        this.doc.schema,
        this.doc
      );

      const group = [...groupedFields.values()][0];
      if (!group) {
        return new Map();
      }

      const filtered = new Map<string, Field[]>();
      for (const [name, fields] of group.entries()) {
        const visibleFields = fields.filter((f) =>
          this.stepFieldNames.includes(f.fieldname as string)
        );
        if (visibleFields.length > 0) {
          filtered.set(name, visibleFields);
        }
      }

      return filtered;
    },
  },
  async mounted() {
    const languageMap = TranslationString.prototype.languageMap;
    this.docOrNull = getSetupWizardDoc(languageMap);
    if (!this.fyo.db.isConnected) {
      await this.fyo.db.init();
    }

    if (this.fyo.store.isDevelopment) {
      // @ts-ignore
      window.sw = this;
    }
    this.fyo.telemetry.log(Verb.Started, ModelNameEnum.SetupWizard);
  },
  methods: {
    async fill() {
      if (!this.hasDoc) {
        return;
      }

      await this.doc.set('companyName', "Lin's Things");
      await this.doc.set('email', 'lin@lthings.com');
      await this.doc.set('phone', '+91 9000000000');
      await this.doc.set('fullname', 'Lin Slovenly');
      await this.doc.set('bankName', 'Max Finance');
      await this.doc.set('country', 'India');
      await this.doc.set('adminUsername', 'admin');
      await this.doc.set('adminPassword', 'admin123');
      await this.doc.set('confirmAdminPassword', 'admin123');
    },
    async onValueChange(field: Field, value: DocValue) {
      if (!this.hasDoc) {
        return;
      }

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
    },
    async submit() {
      if (!this.hasDoc) {
        return;
      }

      if (!this.areCurrentStepValuesFilled) {
        return await showDialog({
          title: this.t`Mandatory Error`,
          detail: this.t`Please fill all values.`,
          type: 'error',
        });
      }

      this.loading = true;
      this.fyo.telemetry.log(Verb.Completed, ModelNameEnum.SetupWizard);
      this.$emit('setup-complete', this.doc.getValidDict());
    },
    async next() {
      if (!this.areCurrentStepValuesFilled) {
        return await showDialog({
          title: this.t`Mandatory Error`,
          detail: this.t`Please fill all values.`,
          type: 'error',
        });
      }
      this.currentStep = 2;
    },
    back() {
      this.currentStep = 1;
    },
    cancel() {
      this.fyo.telemetry.log(Verb.Cancelled, ModelNameEnum.SetupWizard);
      this.$emit('setup-canceled');
    },
  },
});
</script>
