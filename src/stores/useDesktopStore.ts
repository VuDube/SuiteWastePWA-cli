import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
export type WindowState = 'minimized' | 'maximized' | 'normal';
export interface WindowInstance {
  id: string;
  appId: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  position: { x: number; y: number };
  size: { width: number | string; height: number | string };
  zIndex: number;
  state: WindowState;
  desktopId: string;
}
export interface Notification {
  id: string;
  appId: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  timestamp: number;
}
export interface Desktop {
  id: string;
  name: string;
}
interface DesktopState {
  windows: WindowInstance[];
  notifications: Notification[];
  activeWindowId: string | null;
  nextZIndex: number;
  wallpaper: string;
  desktops: Desktop[];
  currentDesktopId: string;
  nextDesktopId: number;
  appsState: Record<string, any>;
}
interface DesktopActions {
  openApp: (appId: string, meta?: { title?: string; icon?: React.ComponentType<{ className?: string }> }) => void;
  closeApp: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  setWindowState: (windowId: string, state: WindowState) => void;
  updateWindowPosition: (windowId: string, position: { x: number; y: number }) => void;
  updateWindowSize: (windowId: string, size: { width: number | string; height: number | string }) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (notificationId: string) => void;
  clearNotifications: () => void;
  setWallpaper: (wallpaperUrl: string) => void;
  addDesktop: () => void;
  removeDesktop: (desktopId: string) => void;
  setCurrentDesktop: (desktopId: string) => void;
  updateAppState: (appId: string, data: any) => void;
}
const initialState: DesktopState = {
  windows: [],
  notifications: [],
  activeWindowId: null,
  nextZIndex: 100,
  wallpaper: '', // Default to empty to trigger canvas wallpaper
  desktops: [{ id: '1', name: 'os.desktop.1' }],
  currentDesktopId: '1',
  nextDesktopId: 2,
  appsState: {},
};
export const useDesktopStore = create<DesktopState & DesktopActions>()(
  immer((set, get) => ({
    ...initialState,
    openApp: (appId, meta?: { title?: string; icon?: React.ComponentType<{ className?: string }> }) => {
      const currentDesktopId = get().currentDesktopId;
      const existingWindow = get().windows.find((w) => w.appId === appId && w.desktopId === currentDesktopId);
      if (existingWindow) {
        get().focusWindow(existingWindow.id);
        if (existingWindow.state === 'minimized') {
          get().setWindowState(existingWindow.id, 'normal');
        }
        return;
      }
      const defaultIcon: React.ComponentType<{ className?: string }> = () => null;
      const newWindow: WindowInstance = {
        id: `win_${crypto.randomUUID()}`,
        appId: appId,
        title: meta?.title ?? appId,
        icon: meta?.icon ?? defaultIcon,
        position: { x: Math.random() * 200 + 50, y: Math.random() * 100 + 50 },
        size: { width: 800, height: 600 },
        zIndex: get().nextZIndex,
        state: 'normal',
        desktopId: currentDesktopId,
      };
      set((state) => {
        state.windows.push(newWindow);
        state.activeWindowId = newWindow.id;
        state.nextZIndex += 1;
      });
    },
    closeApp: (windowId) => {
      set((state) => {
        state.windows = state.windows.filter((w) => w.id !== windowId);
        if (state.activeWindowId === windowId) {
          const windowsOnCurrentDesktop = state.windows.filter(w => w.desktopId === state.currentDesktopId);
          state.activeWindowId = windowsOnCurrentDesktop.length > 0 ? windowsOnCurrentDesktop[windowsOnCurrentDesktop.length - 1].id : null;
        }
      });
    },
    focusWindow: (windowId) => {
      // avoid calling set at all if the window doesn't exist
      const exists = get().windows.find((w) => w.id === windowId);
      if (!exists) return;
      set((state) => {
        const targetWindow = state.windows.find((w) => w.id === windowId);
        if (!targetWindow) return;
        // If already topmost, still ensure activeWindowId is set
        if (targetWindow.zIndex === state.nextZIndex - 1) {
          state.activeWindowId = windowId;
          return;
        }
        targetWindow.zIndex = state.nextZIndex;
        state.nextZIndex += 1;
        state.activeWindowId = windowId;
      });
    },
    setWindowState: (windowId, windowState) => {
      set((state) => {
        const window = state.windows.find((w) => w.id === windowId);
        if (window) {
          window.state = windowState;
          if (windowState !== 'minimized') {
            // Bring window to front and set activeWindowId atomically to avoid nested updates
            if (window.zIndex !== state.nextZIndex - 1) {
              window.zIndex = state.nextZIndex;
              state.nextZIndex += 1;
            }
            state.activeWindowId = windowId;
          }
        }
      });
    },
    updateWindowPosition: (windowId, position) => {
      set((state) => {
        const window = state.windows.find((w) => w.id === windowId);
        if (window) {
          window.position = position;
        }
      });
    },
    updateWindowSize: (windowId, size) => {
      set((state) => {
        const window = state.windows.find((w) => w.id === windowId);
        if (window) {
          window.size = size;
        }
      });
    },
    addNotification: (notification) => {
      const newNotification: Notification = {
        ...notification,
        id: `notif_${crypto.randomUUID()}`,
        timestamp: Date.now(),
      };
      set((state) => {
        state.notifications.unshift(newNotification);
        if (state.notifications.length > 20) {
          state.notifications.pop();
        }
      });
    },
    removeNotification: (notificationId) => {
      set((state) => {
        state.notifications = state.notifications.filter((n) => n.id !== notificationId);
      });
    },
    clearNotifications: () => {
      set((state) => {
        state.notifications = [];
      });
    },
    setWallpaper: (wallpaperUrl) => {
      set((state) => {
        state.wallpaper = wallpaperUrl;
      });
    },
    addDesktop: () => {
      set((state) => {
        const newDesktopId = state.nextDesktopId.toString();
        state.desktops.push({ id: newDesktopId, name: `os.desktop.${newDesktopId}` });
        state.nextDesktopId += 1;
        state.currentDesktopId = newDesktopId;
      });
    },
    removeDesktop: (desktopId) => {
      if (get().desktops.length <= 1) return;
      set((state) => {
        const desktopToRemove = state.desktops.find(d => d.id === desktopId);
        if (!desktopToRemove) return;
        const remainingDesktops = state.desktops.filter((d) => d.id !== desktopId);
        const fallbackDesktopId = remainingDesktops[0].id;
        // Move windows from the removed desktop to the fallback desktop
        state.windows.forEach(win => {
          if (win.desktopId === desktopId) {
            win.desktopId = fallbackDesktopId;
          }
        });
        state.desktops = remainingDesktops;
        if (state.currentDesktopId === desktopId) {
          state.currentDesktopId = fallbackDesktopId;
        }
      });
    },
    setCurrentDesktop: (desktopId) => {
      set((state) => {
        state.currentDesktopId = desktopId;
        state.activeWindowId = null;
      });
    },
    updateAppState: (appId, data) => {
      set((state) => {
        state.appsState[appId] = { ...state.appsState[appId], ...data };
      });
    },
  }))
);