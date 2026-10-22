<script setup lang="ts">
// Поле «сколько»: граммы или штуки (lib/amount.ts). В «шт» под полем —
// вес одной штуки: подставлен из продукта, его можно вписать или поправить.
import { formatPieces, type Amount } from '../lib/amount'

defineProps<{ amount: Amount }>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2 rounded-2xl glass px-4 py-3">
      <input
        v-if="amount.unit === 'g'"
        v-model="amount.gramsInput"
        type="text"
        inputmode="decimal"
        autofocus
        :placeholder="String(amount.defaultGrams)"
        @focus="amount.clearOnFocus"
        class="flex-1 min-w-0 text-2xl font-semibold text-ink bg-transparent outline-none"
      />
      <input
        v-else
        v-model="amount.piecesInput"
        type="text"
        inputmode="decimal"
        autofocus
        :placeholder="formatPieces(amount.defaultPieces)"
        @focus="amount.clearOnFocus"
        class="flex-1 min-w-0 text-2xl font-semibold text-ink bg-transparent outline-none"
      />
      <!-- г | шт -->
      <div class="flex rounded-xl border border-line p-0.5 text-sm shrink-0">
        <button
          type="button"
          @click="amount.unit = 'g'"
          class="px-3 py-1 rounded-lg"
          :class="amount.unit === 'g' ? 'bg-accent text-white' : 'text-muted'"
        >
          г
        </button>
        <button
          type="button"
          @click="amount.unit = 'pcs'"
          class="px-3 py-1 rounded-lg"
          :class="amount.unit === 'pcs' ? 'bg-accent text-white' : 'text-muted'"
        >
          шт
        </button>
      </div>
    </div>

    <label v-if="amount.unit === 'pcs'" class="flex items-center gap-2 text-sm text-muted px-1">
      1 шт =
      <input
        v-model="amount.pieceGramsInput"
        type="text"
        inputmode="decimal"
        placeholder="вес"
        class="w-20 rounded-xl border px-2 py-1 text-ink bg-transparent outline-none focus:ring-2 focus:ring-accent"
        :class="amount.pieceGrams === null ? 'border-accent' : 'border-line'"
      />
      г
      <span v-if="amount.pieceGrams !== null" class="ml-auto text-ink">= {{ amount.grams }} г</span>
      <span v-else class="ml-auto text-xs">сколько весит одна?</span>
    </label>
  </div>
</template>
