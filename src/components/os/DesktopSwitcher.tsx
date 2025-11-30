import React from 'react';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
const DesktopSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const { desktops, currentDesktopId, setCurrentDesktop, addDesktop, removeDesktop } = useDesktopStore(
    useShallow((state) => ({
      desktops: state.desktops,
      currentDesktopId: state.currentDesktopId,
      setCurrentDesktop: state.setCurrentDesktop,
      addDesktop: state.addDesktop,
      removeDesktop: state.removeDesktop,
    }))
  );
  return (
    <div className="flex items-center gap-1 bg-secondary p-1 rounded-md">
      <AnimatePresence>
        {desktops.map((desktop) => (
          <motion.div
            key={desktop.id}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="relative group"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentDesktop(desktop.id)}
              className={cn(
                'px-3 transition-all duration-200',
                currentDesktopId === desktop.id ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/50'
              )}
            >
              {t(desktop.name)}
            </Button>
            {desktops.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive/80 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeDesktop(desktop.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addDesktop}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};
export default DesktopSwitcher;