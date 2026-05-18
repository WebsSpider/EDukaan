<template>
  <div class="flex items-center gap-3 w-full max-w-2xl mx-auto">
    <!-- Item Group Code -->
    <div class="relative flex-1">
      <input
        ref="codeInput"
        v-model="itemGroupCode"
        type="text"
        :placeholder="t`Item Code`"
        class="
          block px-3 pb-2 pt-3 w-full text-base font-medium
          text-gray-900 dark:text-gray-100
          bg-white dark:bg-gray-850
          rounded-lg border-2
          dark:border-gray-700
          appearance-none focus:outline-none focus:ring-0
          focus:border-blue-500 dark:focus:border-blue-500
          transition-colors
        "
        :class="codeError ? 'border-red-400' : 'border-gray-200'"
        autocomplete="off"
        @keydown.enter.prevent="focusQty"
        @input="codeError = ''"
      />
      <label
        class="
          absolute text-xs font-semibold text-gray-500 dark:text-gray-400
          top-0.5 left-3 pointer-events-none
        "
      >{{ t`Item Group Code` }}</label>
      <p v-if="codeError" class="mt-0.5 text-xs text-red-500 pl-1">
        {{ codeError }}
      </p>
    </div>

    <!-- Quantity -->
    <div class="relative w-28">
      <input
        ref="qtyInput"
        v-model.number="quantity"
        type="number"
        min="1"
        :placeholder="t`Qty`"
        class="
          block px-3 pb-2 pt-3 w-full text-base font-medium
          text-gray-900 dark:text-gray-100
          bg-white dark:bg-gray-850
          rounded-lg border-2 border-gray-200
          dark:border-gray-700
          appearance-none focus:outline-none focus:ring-0
          focus:border-blue-500 dark:focus:border-blue-500
          transition-colors
        "
        autocomplete="off"
        @keydown.enter.prevent="focusPrice"
      />
      <label
        class="
          absolute text-xs font-semibold text-gray-500 dark:text-gray-400
          top-0.5 left-3 pointer-events-none
        "
      >{{ t`Qty` }}</label>
    </div>

    <!-- Price -->
    <div class="relative w-36">
      <input
        ref="priceInput"
        v-model.number="price"
        type="number"
        min="0"
        step="0.01"
        :placeholder="t`Price (default)`"
        class="
          block px-3 pb-2 pt-3 w-full text-base font-medium
          text-gray-900 dark:text-gray-100
          bg-white dark:bg-gray-850
          rounded-lg border-2 border-gray-200
          dark:border-gray-700
          appearance-none focus:outline-none focus:ring-0
          focus:border-blue-500 dark:focus:border-blue-500
          transition-colors
        "
        autocomplete="off"
        @keydown.enter.prevent="handleSubmit"
      />
      <label
        class="
          absolute text-xs font-semibold text-gray-500 dark:text-gray-400
          top-0.5 left-3 pointer-events-none
        "
      >{{ t`Price (default)` }}</label>
    </div>

    <!-- Add Button -->
    <button
      class="
        flex-shrink-0 px-4 py-2.5 rounded-lg
        bg-blue-500 hover:bg-blue-600 active:bg-blue-700
        text-white font-semibold text-sm
        transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300
        disabled:opacity-50 disabled:cursor-not-allowed
      "
      :disabled="loading"
      @click="handleSubmit"
    >
      <span v-if="loading">...</span>
      <span v-else>{{ t`Add` }}</span>
    </button>
  </div>
</template>

<script lang="ts">
import { t } from 'fyo';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'QuickEntryBar',
  emits: ['quickEntryAdd'],
  data() {
    return {
      itemGroupCode: '' as string,
      quantity: 1 as number,
      price: null as number | null,
      codeError: '' as string,
      loading: false,
    };
  },
  methods: {
    focusQty() {
      (this.$refs.qtyInput as HTMLInputElement)?.focus();
      (this.$refs.qtyInput as HTMLInputElement)?.select();
    },
    focusPrice() {
      (this.$refs.priceInput as HTMLInputElement)?.focus();
      (this.$refs.priceInput as HTMLInputElement)?.select();
    },
    focusCode() {
      this.$nextTick(() => {
        (this.$refs.codeInput as HTMLInputElement)?.focus();
        (this.$refs.codeInput as HTMLInputElement)?.select();
      });
    },
    async handleSubmit() {
      const code = this.itemGroupCode.trim();
      if (!code) {
        this.codeError = t`Item Group Code is required`;
        (this.$refs.codeInput as HTMLInputElement)?.focus();
        return;
      }

      const qty = !this.quantity || this.quantity <= 0 ? 1 : this.quantity;

      this.loading = true;
      this.$emit('quickEntryAdd', code, qty, this.price ?? 0);
    },
    reset() {
      this.itemGroupCode = '';
      this.quantity = 1;
      this.price = null;
      this.codeError = '';
      this.loading = false;
      this.focusCode();
    },
  },
});
</script>
