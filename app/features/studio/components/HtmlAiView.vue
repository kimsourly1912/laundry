<script setup lang="ts">
/**
 * The Studio sidebar's AI view (v1 contract): copy the prompt, with an optional brief, for the
 * author's own AI tool, then paste its JSON answer back. A valid answer goes to the page, which
 * replaces the markup; problems show here, next to the pasted text.
 */
import type { SlipDesign } from '#shared/contracts/slip-design'
import { aiPrompt, readAiAnswer } from '#shared/html-slip/ai'
import type { AiAnswer, AnswerProblem } from '#shared/html-slip/ai'

const props = defineProps<{ design: SlipDesign, readOnly: boolean }>()
const emit = defineEmits<{ import: [answer: AiAnswer] }>()
const { t } = useI18n()
const toast = useToast()

const brief = ref('')
async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(aiPrompt({ design: props.design, brief: brief.value }))
    toast.add({ title: t('studio.html.promptCopied'), color: 'success', icon: 'i-lucide-clipboard-check' })
  }
  catch {
    toast.add({ title: t('studio.html.copyFailed'), color: 'error' })
  }
}

const pasted = ref('')
const problems = ref<AnswerProblem[]>([])
function importAnswer() {
  const read = readAiAnswer(pasted.value)
  if ('problems' in read) {
    problems.value = read.problems
    return
  }
  problems.value = []
  pasted.value = ''
  emit('import', read.answer)
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('studio.html.ai.step1') }}
      </h3>
      <p class="text-sm text-muted">
        {{ t('studio.html.promptHint') }}
      </p>
      <UFormField :label="t('studio.html.brief')">
        <UTextarea
          v-model="brief"
          :rows="3"
          autoresize
          class="w-full"
          :placeholder="t('studio.html.briefPlaceholder')"
        />
      </UFormField>
      <UButton
        :label="t('studio.html.copyPrompt')"
        icon="i-lucide-clipboard-copy"
        color="neutral"
        variant="outline"
        block
        data-testid="copy-prompt"
        @click="copyPrompt"
      />
    </section>

    <section
      v-if="!readOnly"
      class="space-y-3"
    >
      <h3 class="text-sm font-semibold text-highlighted">
        {{ t('studio.html.ai.step2') }}
      </h3>
      <p class="text-sm text-muted">
        {{ t('studio.html.importHint') }}
      </p>
      <UTextarea
        v-model="pasted"
        :rows="8"
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
        :aria-label="t('studio.html.answer')"
        :placeholder="t('studio.html.ai.pastePlaceholder')"
        data-testid="answer-text"
        @update:model-value="problems = []"
      />
      <ul
        v-if="problems.length"
        class="space-y-1 text-sm text-error"
        role="alert"
        data-testid="answer-problems"
      >
        <li
          v-for="(problem, index) in problems"
          :key="index"
        >
          {{ problem.where }}: {{ problem.message }}
        </li>
      </ul>
      <UButton
        :label="t('studio.html.importJson')"
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        block
        :disabled="!pasted.trim()"
        data-testid="answer-import"
        @click="importAnswer"
      />
    </section>
  </div>
</template>
