import React from 'react';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';
const NotificationCenter: React.FC = () => {
  const { t } = useTranslation();
  const { notifications, clearNotifications } = useDesktopStore(
    useShallow((state) => ({
      notifications: state.notifications,
      clearNotifications: state.clearNotifications,
    }))
  );
  return (
    <div className="flex flex-col h-[400px]">
      <header className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">{t('os.notifications.title')}</h3>
        {notifications.length > 0 && (
          <Button variant="link" size="sm" onClick={clearNotifications} className="p-0 h-auto">
            {t('os.notifications.clearAll')}
          </Button>
        )}
      </header>
      <ScrollArea className="flex-1">
        {notifications.length === 0 ? (
          <div className="text-center text-muted-foreground p-8">
            <p>{t('os.notifications.noNotifications')}</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            <AnimatePresence>
              {notifications.map((notif) => (
                <motion.div
                  key={notif.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-3 rounded-md bg-secondary"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-background rounded-full mt-1">
                      <notif.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{notif.title}</p>
                      <p className="text-xs text-muted-foreground">{notif.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(notif.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
export default NotificationCenter;