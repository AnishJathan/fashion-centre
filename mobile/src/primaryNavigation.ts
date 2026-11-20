/** Shared order, visible labels and 24-unit icon paths for both renderers. */
export const primaryNavigation = [
  {
    id: 'home', href: '/', label: 'Discover',
    path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3 5.3-2.3Z',
  },
  {
    id: 'prepare', href: '/try', label: 'Try on',
    path: 'M8 3.5H5.5a2 2 0 0 0-2 2V8 M16 3.5h2.5a2 2 0 0 1 2 2V8 M20.5 16v2.5a2 2 0 0 1-2 2H16 M8 20.5H5.5a2 2 0 0 1-2-2V16 M7 12h10',
  },
  {
    id: 'cart', href: '/cart', label: 'Bag',
    path: 'M5.5 7.5h13l1 11.4a1.5 1.5 0 0 1-1.5 1.6H6a1.5 1.5 0 0 1-1.5-1.6l1-11.4Z M8.5 9V6a3.5 3.5 0 0 1 7 0v3',
  },
  {
    id: 'profile', href: '/profile', label: 'Profile',
    path: 'M15.6 7.5a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0Z M4.8 20c.3-3.8 3.2-6 7.2-6s6.9 2.2 7.2 6',
  },
] as const;
