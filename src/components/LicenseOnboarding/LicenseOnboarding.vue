<template>
  <FormContainer :show-header="false" class="items-center justify-center h-full">
    <template #body>
      <div class="w-full max-w-md box-border p-6">
        <h2 class="text-xl font-semibold mb-1 text-gray-900 dark:text-gray-100">
          {{ t`EDukan` }}
        </h2>
        <p
          v-if="companyName"
          class="text-sm text-gray-600 dark:text-gray-300 mb-4"
        >
          {{ companyName }}
        </p>
        <p
          v-if="!statusLoaded"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          {{ t`Loading...` }}
        </p>
        <template v-else>
          <p
            v-if="licenseServerMessage"
            class="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded p-3 mb-4"
          >
            {{ licenseServerMessage }}
          </p>
          <p
            v-else-if="!allowStartTrial && !licenseServerMessage"
            class="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded p-3 mb-4"
          >
            {{ t`Your free trial has ended. Enter a license key to continue, or contact support to renew.` }}
          </p>
          <p
            v-else
            class="text-sm text-gray-600 dark:text-gray-300 mb-4"
          >
            {{ t`Start a free trial or activate with a license key or license file.` }}
          </p>

          <div
            class="space-y-3 mb-4"
            role="radiogroup"
            :aria-label="t`License option`"
          >
            <label
              v-if="allowStartTrial"
              class="flex items-start gap-3 cursor-pointer p-2 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            >
              <input
                v-model="choice"
                type="radio"
                value="trial"
                class="mt-1"
              />
              <span class="text-gray-800 dark:text-gray-200">
                {{ t`Start free trial` }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ t`Full access for 14 days` }}
                </span>
              </span>
            </label>
            <label
              class="flex items-start gap-3 cursor-pointer p-2 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            >
              <input
                v-model="choice"
                type="radio"
                value="key"
                class="mt-1"
              />
              <span class="text-gray-800 dark:text-gray-200">
                {{ t`I have a license key` }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ t`Activates online with the license server` }}
                </span>
              </span>
            </label>
            <label
              class="flex items-start gap-3 cursor-pointer p-2 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            >
              <input
                v-model="choice"
                type="radio"
                value="file"
                class="mt-1"
              />
              <span class="text-gray-800 dark:text-gray-200">
                {{ t`I have a license file` }}
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ t`Signed JSON file — verified on this device only` }}
                </span>
              </span>
            </label>
          </div>

          <div v-if="choice === 'key'" class="mb-4">
            <label
              class="text-sm text-gray-700 dark:text-gray-200 block mb-1"
            >{{ t`License key` }}</label>
            <input
              v-model="licenseKey"
              type="text"
              class="w-full p-2 border rounded bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
              :placeholder="t`Enter your license key`"
              @keydown.enter="submit"
            />
          </div>

          <div
            v-if="choice === 'file'"
            class="text-sm text-gray-600 dark:text-gray-300 mb-4 space-y-3"
          >
            <p>
              {{ t`Choose the signed license JSON you received. It will be checked locally with the app public key.` }}
            </p>
            <Button
              type="secondary"
              class="w-full"
              :disabled="submitting"
              @click="uploadLicenseJson"
            >
              {{ t`Select license file` }}
            </Button>
          </div>

          <p v-if="formError" class="text-sm text-red-600 dark:text-red-400 mb-3">
            {{ formError }}
          </p>

          <Button
            type="primary"
            class="w-full"
            :disabled="submitting || choice === 'file'"
            @click="submit"
          >
            {{ t`Continue` }}
          </Button>
        </template>
      </div>
    </template>
  </FormContainer>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';
import type { LicenseGetStatusResult } from 'utils/license/types';

export default defineComponent({
  name: 'LicenseOnboarding',
  components: { Button, FormContainer },
  props: {
    companyName: { type: String, default: '' },
  },
  emits: ['continue'],
  data() {
    return {
      statusLoaded: false,
      allowStartTrial: true,
      licenseServerMessage: '' as string,
      choice: 'trial' as 'trial' | 'key' | 'file',
      licenseKey: '',
      formError: '',
      submitting: false,
    };
  },
  async mounted() {
    await this.refreshStatus();
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
    async refreshStatus() {
      this.statusLoaded = false;
      this.formError = '';
      const status: LicenseGetStatusResult = await ipc.license.getStatus();
      this.allowStartTrial = status.allowStartTrial;
      this.licenseServerMessage = status.licenseServerMessage ?? '';
      this.choice = status.allowStartTrial ? 'trial' : 'key';
      this.statusLoaded = true;
    },
    async submit() {
      if (this.choice === 'file') {
        return;
      }
      this.formError = '';
      this.submitting = true;
      try {
        if (this.allowStartTrial && this.choice === 'trial') {
          const r = await ipc.license.startTrial(this.companyName);
          if (!r.success) {
            this.formError = r.error;
            return;
          }
          window.dispatchEvent(new Event('edukan:license-updated'));
          this.$emit('continue');
          return;
        }
        const key = this.licenseKey.trim();
        if (key.length < 4) {
          this.formError = this.t`Please enter a valid license key.`;
          return;
        }
        const r = await ipc.license.submitLicenseKey(key, this.companyName);
        if (!r.success) {
          this.formError = r.error;
          return;
        }
        window.dispatchEvent(new Event('edukan:license-updated'));
        this.$emit('continue');
      } finally {
        this.submitting = false;
      }
    },
    async uploadLicenseJson() {
      this.formError = '';
      this.submitting = true;
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
          this.formError = this.t`Invalid JSON file.`;
          return;
        }
        const result = await ipc.license.installJson(rawJson);
        if (!result.success) {
          this.formError = result.error;
          return;
        }
        window.dispatchEvent(new Event('edukan:license-updated'));
        this.$emit('continue');
      } finally {
        this.submitting = false;
      }
    },
  },
});
</script>
