<script setup lang="ts">
/**
 * The HTML Studio's sidebar, as in VS Code: the open view's title and a close button over the view,
 * which scrolls on its own. The page shows it in a resizable panel from `lg`, and in a slideover from
 * the left on a phone; the views are the same in both.
 */
import type { HtmlIntakePreset, SlipDesign } from '#shared/contracts/slip-design'
import type { ImageSummary } from '#shared/contracts/templates'
import type { AiAnswer } from '#shared/html-slip/ai'
import type { SidebarView } from '../utils/html-sidebar'
import HtmlAiView from './HtmlAiView.vue'
import HtmlFieldsView from './HtmlFieldsView.vue'
import HtmlImagesView from './HtmlImagesView.vue'
import HtmlPaperView from './HtmlPaperView.vue'
import HtmlPresetsView from './HtmlPresetsView.vue'

defineProps<{
  view: SidebarView
  design: SlipDesign
  readOnly: boolean
  /** The markup is empty, so a preset may fill it. */
  empty: boolean
}>()
const emit = defineEmits<{
  change: [design: SlipDesign]
  preset: [preset: HtmlIntakePreset]
  image: [image: ImageSummary]
  import: [answer: AiAnswer]
  /** A placeholder for the editor's cursor. */
  insert: [text: string]
  /** Open Test order. */
  test: []
  close: []
}>()
const { t } = useI18n()
</script>

<template>
  <aside
    id="html-studio-sidebar"
    class="flex min-h-0 min-w-0 flex-1 flex-col bg-default"
    aria-labelledby="html-studio-sidebar-title"
    :data-testid="`sidebar-${view}`"
  >
    <div class="flex items-center gap-2 py-1.5 ps-4 pe-1.5">
      <h2
        id="html-studio-sidebar-title"
        class="me-auto truncate text-xs font-semibold text-highlighted"
      >
        {{ t(`studio.html.sidebar.views.${view}`) }}
      </h2>
      <UTooltip :text="t('studio.html.sidebar.close')">
        <UButton
          icon="i-lucide-panel-left-close"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('studio.html.sidebar.close')"
          @click="emit('close')"
        />
      </UTooltip>
    </div>
    <!-- Keyed by view, so a view opens at its top rather than at the last one's scroll. -->
    <div
      :key="view"
      class="@container min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4"
    >
      <HtmlFieldsView
        v-if="view === 'fields'"
        :design="design"
        :read-only="readOnly"
        @change="emit('change', $event)"
        @insert="emit('insert', $event)"
        @test="emit('test')"
      />
      <HtmlPresetsView
        v-else-if="view === 'presets'"
        :size="{ width: design.width, height: design.height, paper: design.paper }"
        :disabled="readOnly || !empty"
        @pick="emit('preset', $event)"
      />
      <HtmlImagesView
        v-else-if="view === 'images'"
        @chosen="emit('image', $event)"
      />
      <HtmlAiView
        v-else-if="view === 'ai'"
        :design="design"
        :read-only="readOnly"
        @import="emit('import', $event)"
      />
      <HtmlPaperView
        v-else
        :design="design"
        :read-only="readOnly"
        @change="emit('change', $event)"
      />
    </div>
  </aside>
</template>
