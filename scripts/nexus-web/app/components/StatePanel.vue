<script setup lang="ts">
const props = defineProps<{ kind: 'error' | 'locked' | 'empty'; retrying: boolean }>()
defineEmits<{ retry: [] }>()
const COPY = {
  error: { role: 'alert', title: 'The calendar is not available right now.', text: '', button: 'Retry', busy: 'Retrying…' },
  // pending Jack: the Designer wrote "Unlock the Keychain on the Workbox"; the file key is used first, so the wording stays neutral
  locked: { role: 'alert', title: 'The calendar is locked.', text: 'The server cannot read its encryption key. Check the key on the Workbox, then try again.', button: 'Retry', busy: 'Retrying…' },
  empty: { role: 'status', title: 'No calendar yet.', text: 'The server has no profile saved. Run the seed step on the Workbox, then reload.', button: 'Reload', busy: 'Reloading…' },
} as const
const copy = computed(() => COPY[props.kind])
</script>

<template>
  <div class="panel" :role="copy.role">
    <svg v-if="kind !== 'empty'" class="icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10 5.5v5.5M10 13.6v.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    <p class="title">{{ copy.title }}</p>
    <p v-if="copy.text" class="text">{{ copy.text }}</p>
    <AppButton :busy="retrying" :busy-label="copy.busy" @click="$emit('retry')">{{ copy.button }}</AppButton>
  </div>
</template>

<style scoped lang="scss">
.panel { max-width: 360px; margin: 0 auto; padding: 24px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); text-align: center; display: grid; gap: 12px; justify-items: center; }
.icon { color: var(--ink-2); }
.title { margin: 0; font-weight: 650; }
.text { margin: 0; color: var(--ink-2); font-size: 15px; }
</style>
