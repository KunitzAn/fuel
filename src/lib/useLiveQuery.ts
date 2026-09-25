import { liveQuery } from 'dexie'
import { onScopeDispose, ref, type Ref } from 'vue'

export function useLiveQuery<T>(querier: () => T | Promise<T>, initial: T): Ref<T> {
  const value = ref(initial) as Ref<T>
  const subscription = liveQuery(querier).subscribe({
    next: (result) => {
      value.value = result
    },
    error: (err) => console.error(err),
  })
  onScopeDispose(() => subscription.unsubscribe())
  return value
}
