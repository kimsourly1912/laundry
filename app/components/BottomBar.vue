<script setup lang="ts">
/**
 * A page's primary actions in thumb reach (docs/standards/responsive-layout.md → Page anatomy):
 * fixed to the bottom at every width, inside the shop's 768px column, with the safe-area inset. One
 * per page. The page puts `<BottomBarSpacer />` last in its body, so nothing hides behind the bar.
 */
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-10 border-t border-default bg-default/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
    <div class="mx-auto flex w-full max-w-page flex-wrap items-center justify-end gap-2">
      <slot />
    </div>
  </div>
</template>
