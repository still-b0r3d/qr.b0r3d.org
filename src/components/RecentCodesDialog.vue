<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import RecentCodesList from '@/components/RecentCodesList.vue'
import { MAX_RECENT_CODES, type RecentCodeDetails } from '@/utils/recentCodes'
import { useMediaQuery } from '@vueuse/core'
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'open-code', details: RecentCodeDetails): void
}>()
const { t } = useI18n()
const isLarge = useMediaQuery('(min-width: 768px)')

// The drawer doesn't move focus into itself; without this, keyboard focus
// stays on the page behind it.
const drawerList = ref<InstanceType<typeof RecentCodesList> | null>(null)
function focusDrawer(event: Event) {
  event.preventDefault()
  void nextTick(() => drawerList.value?.focus())
}
</script>

<template>
  <!-- A dialog on wide screens, a drawer from the bottom on phones, like the
       "Customize fields" panel. -->
  <Dialog v-if="isLarge" :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ t('Recent codes') }}</DialogTitle>
        <DialogDescription>
          {{
            t('The last {max} codes you made here. Open one to change it or export it again.', {
              max: MAX_RECENT_CODES
            })
          }}
        </DialogDescription>
      </DialogHeader>
      <RecentCodesList id="recent-codes-dialog" @open="emit('open-code', $event)" />
    </DialogContent>
  </Dialog>

  <Drawer v-else :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent @open-auto-focus="focusDrawer">
      <DrawerHeader>
        <DrawerTitle>{{ t('Recent codes') }}</DrawerTitle>
        <DrawerDescription>
          {{
            t('The last {max} codes you made here. Open one to change it or export it again.', {
              max: MAX_RECENT_CODES
            })
          }}
        </DrawerDescription>
      </DrawerHeader>
      <div class="max-h-[70dvh] overflow-y-auto px-4 pb-4">
        <RecentCodesList
          id="recent-codes-dialog"
          ref="drawerList"
          @open="emit('open-code', $event)"
        />
      </div>
    </DrawerContent>
  </Drawer>
</template>
