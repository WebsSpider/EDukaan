<template>
  <FormContainer :show-header="false" class="items-center justify-center h-full">
    <template #body>
      <div class="w-full box-border p-6">
        <h2 class="text-xl font-semibold mb-4" style="color: orangered;">
          {{ t`Login` }}
        </h2>
        <div class="space-y-3">
          <input
            v-model="username"
            class="w-full p-2 border rounded dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            :placeholder="t`Username`"
            @keydown.enter="submit"
          />
          <input
            v-model="password"
            type="password"
            class="w-full p-2 border rounded dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
            :placeholder="t`Password`"
            @keydown.enter="submit"
          />
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
          <Button type="primary" class="w-full" @click="submit">
            {{ t`Login` }}
          </Button>
        </div>
      </div>
    </template>
  </FormContainer>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import Button from 'src/components/Button.vue';
import FormContainer from 'src/components/FormContainer.vue';

export default defineComponent({
  name: 'LoginScreen',
  components: { Button, FormContainer },
  props: {
    companyName: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  emits: ['login'],
  data() {
    return {
      username: '',
      password: '',
    };
  },
  methods: {
    submit() {
      this.$emit('login', {
        username: this.username.trim(),
        password: this.password,
      });
    },
  },
});
</script>
