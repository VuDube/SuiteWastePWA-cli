import React from 'react';
import Window from './Window';
import { APPS } from '@/config/apps.config';
import { WindowInstance } from '@/stores/useDesktopStore';
interface WindowManagerProps {
  windows: WindowInstance[];
}
const WindowManager: React.FC<WindowManagerProps> = ({ windows }) => {
  return (
    <>
      {windows.map((win) => {
        const App = APPS.find((app) => app.id === win.appId)?.component;
        if (!App) return null;
        return (
          <Window key={win.id} {...win}>
            <App />
          </Window>
        );
      })}
    </>
  );
};
export default WindowManager;