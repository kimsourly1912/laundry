# Slip printing

← [Reference](./README.md)

`useSlipPrint` registers the physical page and slip size from a reactive paper getter. Its returned action waits for images in the `.print-slip` box and opens the browser print dialog. The optional root limits the image lookup to that part of the document.

Call the composable during setup and the returned action from a print button. Use the paper dimensions belonging to the displayed version or sample.

```vue
<script setup lang="ts">
import type { Paper } from '#shared/contracts/slip-design'
import { useSlipPrint } from '~/features/slip-fill'

const props = defineProps<{ paper?: Paper }>()
const { t } = useI18n()
const print = useSlipPrint(() => props.paper)
</script>

<template>
  <UButton :label="t('orders.order.print')" @click="print()" />
  <div class="print-slip">
    <slot />
  </div>
</template>
```

The action resolves after the browser returns from its print call. Cancellation and physical print success are handled by the browser and printer.
