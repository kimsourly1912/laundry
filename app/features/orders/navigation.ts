import type { ShellLink } from '~/components/AppShell.vue'

// The shop's two daily pages (D27): the board (home) and a new order.
export const ordersNavigation: ShellLink[] = [
  { label: 'orders.nav', icon: 'i-lucide-shirt', to: '/' },
  { label: 'orders.new', icon: 'i-lucide-plus', to: '/orders/new' },
]
