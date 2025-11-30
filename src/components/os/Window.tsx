import React from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Square, Minus } from 'lucide-react';
import { useDesktopStore, WindowInstance } from '@/stores/useDesktopStore';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
type WindowProps = WindowInstance & {
  children: React.ReactNode;
};
const Window: React.FC<WindowProps> = ({ id, children, ...win }) => {
  const { t } = useTranslation();
  const focusWindow = useDesktopStore((state) => state.focusWindow);
  const closeApp = useDesktopStore((state) => state.closeApp);
  const setWindowState = useDesktopStore((state) => state.setWindowState);
  const updateWindowPosition = useDesktopStore((state) => state.updateWindowPosition);
  const updateWindowSize = useDesktopStore((state) => state.updateWindowSize);
  const activeWindowId = useDesktopStore((state) => state.activeWindowId);
  const isMobile = useIsMobile();
  const isActive = activeWindowId === id;
  const [RndComponent, setRndComponent] = React.useState<any>(null);
  React.useEffect(() => {
    let mounted = true;
    // Dynamically import react-rnd on the client only to avoid SSR/Vite resolution issues
    import('react-rnd')
      .then((m) => {
        if (mounted) {
          setRndComponent(() => (m?.Rnd ?? m?.default ?? m));
        }
      })
      .catch(() => {
        // swallow import errors (keep fallback rendering)
      });
    return () => {
      mounted = false;
    };
  }, []);
  const handleMaximizeToggle = () => {
    setWindowState(id, win.state === 'maximized' ? 'normal' : 'maximized');
  };
  const windowVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { duration: 0.2, ease: 'easeOut' as const } },
    exit: { scale: 0.8, opacity: 0, transition: { duration: 0.15, ease: 'easeIn' as const } },
  };
  if (win.state === 'minimized') {
    return null;
  }
  const isMaximized = win.state === 'maximized' || isMobile;

  return (
    RndComponent ? (
      <RndComponent
        size={isMaximized ? { width: '100%', height: '100%' } : win.size}
        position={isMaximized ? { x: 0, y: 0 } : win.position}
        onDragStart={() => focusWindow(id)}
        onDragStop={(_e: any, d: any) => updateWindowPosition(id, { x: d.x, y: d.y })}
        onResizeStart={() => focusWindow(id)}
        onResizeStop={(_e: any, _dir: any, ref: any, _delta: any, pos: any) => {
          updateWindowSize(id, { width: ref.style.width, height: ref.style.height });
          updateWindowPosition(id, { x: pos.x, y: pos.y });
        }}
        minWidth={300}
        minHeight={200}
        dragHandleClassName="window-drag-handle"
        bounds="parent"
        style={{ zIndex: win.zIndex }}
        disableDragging={isMaximized}
        enableResizing={!isMaximized}
        className={cn('flex', isMobile ? '!w-full !h-full !transform-none' : '')}
      >
        <AnimatePresence>
          <motion.div
            variants={windowVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'flex flex-col w-full h-full bg-card/80 backdrop-blur-lg shadow-2xl border transition-colors',
              isActive ? 'border-primary/50' : 'border-border/50',
              isMobile ? 'rounded-none' : 'rounded-lg'
            )}
            onMouseDownCapture={() => focusWindow(id)}
          >
            <header
              className={cn(
                'window-drag-handle flex items-center justify-between pl-3 pr-1 py-1 cursor-grab active:cursor-grabbing transition-colors',
                isActive ? 'bg-primary/10' : 'bg-secondary/50',
                isMobile ? 'rounded-none' : 'rounded-t-lg'
              )}
              onDoubleClick={isMobile ? undefined : handleMaximizeToggle}
            >
              <div className="flex items-center gap-2">
                <win.icon className="w-4 h-4 text-foreground/80" />
                <span className="text-sm font-medium text-foreground select-none">{t(win.title)}</span>
              </div>
              <div className="flex items-center">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setWindowState(id, 'minimized')} className="p-2 rounded hover:bg-muted">
                        <Minus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('os.windowControls.minimize')}</p></TooltipContent>
                  </Tooltip>
                  {!isMobile && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={handleMaximizeToggle} className="p-2 rounded hover:bg-muted">
                          {win.state === 'maximized' ? <Minimize2 size={14} /> : <Square size={14} />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p>{win.state === 'maximized' ? t('os.windowControls.restore') : t('os.windowControls.maximize')}</p></TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => closeApp(id)} className="p-2 rounded hover:bg-destructive/80 hover:text-destructive-foreground">
                        <X size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('os.windowControls.close')}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </header>
            <div className="flex-1 overflow-hidden bg-background/50">
              {children}
            </div>
          </motion.div>
        </AnimatePresence>
      </RndComponent>
    ) : (
      // Fallback static container used during SSR / before react-rnd is loaded.
      // Preserves layout and styling while disabling drag/resize until client import completes.
      <div
        style={{ zIndex: win.zIndex }}
        className={cn('flex', isMobile ? '!w-full !h-full !transform-none' : '')}
      >
        <AnimatePresence>
          <motion.div
            variants={windowVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'flex flex-col w-full h-full bg-card/80 backdrop-blur-lg shadow-2xl border transition-colors',
              isActive ? 'border-primary/50' : 'border-border/50',
              isMobile ? 'rounded-none' : 'rounded-lg'
            )}
            onMouseDownCapture={() => focusWindow(id)}
          >
            <header
              className={cn(
                'window-drag-handle flex items-center justify-between pl-3 pr-1 py-1 cursor-grab active:cursor-grabbing transition-colors',
                isActive ? 'bg-primary/10' : 'bg-secondary/50',
                isMobile ? 'rounded-none' : 'rounded-t-lg'
              )}
              onDoubleClick={isMobile ? undefined : handleMaximizeToggle}
            >
              <div className="flex items-center gap-2">
                <win.icon className="w-4 h-4 text-foreground/80" />
                <span className="text-sm font-medium text-foreground select-none">{t(win.title)}</span>
              </div>
              <div className="flex items-center">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => setWindowState(id, 'minimized')} className="p-2 rounded hover:bg-muted">
                        <Minus size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('os.windowControls.minimize')}</p></TooltipContent>
                  </Tooltip>
                  {!isMobile && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button onClick={handleMaximizeToggle} className="p-2 rounded hover:bg-muted">
                          {win.state === 'maximized' ? <Minimize2 size={14} /> : <Square size={14} />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p>{win.state === 'maximized' ? t('os.windowControls.restore') : t('os.windowControls.maximize')}</p></TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={() => closeApp(id)} className="p-2 rounded hover:bg-destructive/80 hover:text-destructive-foreground">
                        <X size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('os.windowControls.close')}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </header>
            <div className="flex-1 overflow-hidden bg-background/50">
              {children}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    )
  );
};
export default Window;