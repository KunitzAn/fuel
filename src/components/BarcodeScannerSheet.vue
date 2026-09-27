<script setup lang="ts">
// Экран сканера штрихкода (README «Сканер штрихкода», PLAN.md этап 3).
// Полноэкранный, как FoodFormSheet — камера должна быть на весь экран.
import { ArrowLeft } from '@lucide/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { createBarcodeDetector } from '../lib/barcode'

const emit = defineEmits<{ close: []; detected: [code: string] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
const errorMessage = ref<string | null>(null)
let stream: MediaStream | null = null
let rafId: number | null = null
let stopped = false

async function openCamera(): Promise<MediaStream> {
  // Тыловая камера — предпочтительно; на устройствах без неё (или на
  // десктопе) откатываемся на любую доступную, лишь бы сканер открылся.
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true })
  }
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = 'Камера не поддерживается в этом браузере'
    return
  }
  try {
    stream = await openCamera()
  } catch {
    // iOS в standalone-PWA может переспрашивать разрешение при каждом
    // открытии — это ограничение системы, не баг (README)
    errorMessage.value = 'Нет доступа к камере — разрешите её для приложения в настройках'
    return
  }
  if (stopped || !videoEl.value) return
  videoEl.value.srcObject = stream
  await videoEl.value.play().catch(() => {})

  const detector = createBarcodeDetector()
  let busy = false
  const loop = async () => {
    if (stopped) return
    if (busy || !videoEl.value || videoEl.value.readyState < 2) {
      rafId = requestAnimationFrame(loop)
      return
    }
    busy = true
    try {
      const results = await detector.detect(videoEl.value)
      const code = results[0]?.rawValue
      if (code) {
        stopped = true
        emit('detected', code)
        return
      }
    } catch {
      // Один кадр не распознался — не страшно, пробуем следующий
    } finally {
      busy = false
    }
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  stopped = true
  if (rafId !== null) cancelAnimationFrame(rafId)
  stream?.getTracks().forEach((t) => t.stop())
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black flex flex-col">
    <header class="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 shrink-0">
      <button type="button" @click="emit('close')" class="w-9 h-9 flex items-center justify-center text-white">
        <ArrowLeft :size="20" />
      </button>
      <h1 class="text-lg font-semibold text-white">Сканер штрихкода</h1>
    </header>

    <div class="relative flex-1 overflow-hidden">
      <video ref="videoEl" class="absolute inset-0 w-full h-full object-cover" muted playsinline autoplay />

      <div v-if="!errorMessage" class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-[80%] max-w-xs h-24 rounded-2xl border-2 border-white/80" />
      </div>

      <div v-if="errorMessage" class="absolute inset-0 flex items-center justify-center px-6">
        <p class="text-sm text-white text-center">{{ errorMessage }}</p>
      </div>
    </div>

    <p v-if="!errorMessage" class="px-4 py-4 text-sm text-white/70 text-center shrink-0">Наведите камеру на штрихкод</p>
  </div>
</template>
