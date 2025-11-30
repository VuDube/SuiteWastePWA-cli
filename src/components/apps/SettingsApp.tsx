import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useTheme } from '@/hooks/use-theme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const wallpapers = [
  { name: 'Default', url: '/wallpapers/default.jpg' },
  { name: 'Green Field', url: '/wallpapers/green.jpg' },
  { name: 'Earthy Tones', url: '/wallpapers/earth.jpg' },
];
const languages = [
  { code: 'en', name: 'English' },
  { code: 'zu', name: 'isiZulu' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'xh', name: 'isiXhosa' },
];
const SettingsApp: React.FC = () => {
  const { t, i18n } = useTranslation();
  const wallpaper = useDesktopStore((state) => state.wallpaper);
  const setWallpaper = useDesktopStore((state) => state.setWallpaper);
  const { isDark, toggleTheme } = useTheme();
  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };
  return (
    <ScrollArea className="h-full">
      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.description')}</p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="dark-mode">{t('settings.darkMode')}</Label>
              <Switch id="dark-mode" checked={isDark} onCheckedChange={toggleTheme} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.language')}</Label>
              <Select value={i18n.language} onValueChange={handleLanguageChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('settings.wallpaper')}</Label>
              <div className="grid grid-cols-3 gap-4 mt-2">
                {wallpapers.map((wp) => (
                  <button
                    key={wp.name}
                    className={`relative rounded-md overflow-hidden border-2 ${
                      wallpaper === wp.url ? 'border-primary' : 'border-transparent'
                    }`}
                    onClick={() => setWallpaper(wp.url)}
                  >
                    <img src={wp.url} alt={wp.name} className="w-full h-20 object-cover" />
                    <div className="absolute inset-0 bg-black/20 flex items-end justify-center">
                      <p className="text-white text-xs pb-1">{wp.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
};
export default SettingsApp;