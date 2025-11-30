import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NotificationCenter from './NotificationCenter';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useShallow } from 'zustand/react/shallow';
const SystemTray: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const notifications = useDesktopStore(useShallow((state) => state.notifications));
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
  return (
    <div className="flex items-center gap-2 pr-2">
      <div className="text-xs text-right text-foreground">
        <div>{formattedTime}</div>
        <div className="text-muted-foreground">{formattedDate}</div>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button className="relative p-2 rounded-md hover:bg-accent">
            <Bell className="w-5 h-5" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 justify-center items-center text-[10px] text-white">
                  {notifications.length}
                </span>
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 mb-2 p-0" side="top" align="end">
          <NotificationCenter />
        </PopoverContent>
      </Popover>
    </div>
  );
};
export default SystemTray;