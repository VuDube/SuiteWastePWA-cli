import React from 'react';
import Desktop from '@/components/os/Desktop';
import Taskbar from '@/components/os/Taskbar';
import { Toaster } from '@/components/ui/sonner';
import { useTheme } from '@/hooks/use-theme';
export function HomePage() {
  // Initialize theme
  useTheme();
  return (
    <div className="h-screen w-screen bg-background font-sans flex flex-col">
      <Desktop />
      <Taskbar />
      <Toaster richColors closeButton />
    </div>
  );
}