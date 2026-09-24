<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import TabBar from './components/TabBar.vue'

const route = useRoute()
</script>

<template>
  <RouterView />
  <TabBar v-if="route.meta.tabBar" />
</template>
