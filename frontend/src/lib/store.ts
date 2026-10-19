import { create } from 'zustand';
import type { Settings, User } from './types';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface AppState {
  user: User | null;
  initialized: boolean;
  bootstrapped: boolean;
  settings: Settings;
  sidebarOpen: boolean;
  toasts: ToastItem[];
  setUser: (user: User | null) => void;
  setInitialized: (value: boolean) => void;
  setBootstrapped: (value: boolean) => void;
  setSettings: (settings: Settings) => void;
  mergeSettings: (patch: Settings) => void;
  setSidebarOpen: (open: boolean) => void;
  pushToast: (toast: Omit<ToastItem, 'id'>) => number;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  user: null,
  initialized: false,
  bootstrapped: false,
  settings: {},
  sidebarOpen: false,
  toasts: [],
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized }),
  setBootstrapped: (bootstrapped) => set({ bootstrapped }),
  setSettings: (settings) => set({ settings }),
  mergeSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  pushToast: (toast) => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { ...toast, id }] }));
    const timeout = toast.kind === 'error' ? 6000 : 4000;
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    }, timeout);
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

export const toast = {
  info: (message: string, action?: ToastItem['action']) =>
    useAppStore.getState().pushToast({ kind: 'info', message, action }),
  success: (message: string, action?: ToastItem['action']) =>
    useAppStore.getState().pushToast({ kind: 'success', message, action }),
  error: (message: string, action?: ToastItem['action']) =>
    useAppStore.getState().pushToast({ kind: 'error', message, action }),
};

const accentColors: Record<string, string> = {
  system: '#dc2626',
  red: '#dc2626',
  pink: '#db2777',
  purple: '#7c3aed',
  green: '#16a34a',
  orange: '#ea580c',
  blue: '#2563eb',
};

export function applyTheme(settings: Settings) {
  const mode = String(settings.theme_mode ?? 'system');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  const color = String(settings.color ?? 'system');
  const hex = accentColors[color] ?? accentColors.system;
  const rgb = hexToRgb(hex);
  document.documentElement.style.setProperty('--accent', rgb);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0c0a09' : '#fafaf9');
}

function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function useToast() {
  return toast;
}
