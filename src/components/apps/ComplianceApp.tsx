import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, ShieldCheck, Bot, Loader2 } from 'lucide-react';
import { useDesktopStore } from '@/stores/useDesktopStore';
import { useTranslation } from 'react-i18next';
const APP_ID = 'compliance';
const initialComplianceItems = [
  { id: 'c1', label: 'Waste Carrier License up-to-date', checked: true },
  { id: 'c2', label: 'Vehicle maintenance logs complete', checked: true },
  { id: 'c3', label: 'Driver training records verified', checked: false },
  { id: 'c4', label: 'Waste transfer notes correctly filed', checked: true },
  { id: 'c5', label: 'Health & Safety audit passed', checked: false },
];
const ComplianceApp: React.FC = () => {
  const { t } = useTranslation();
  const [isAuditing, setIsAuditing] = useState(false);
  const appState = useDesktopStore((state) => state.appsState[APP_ID]);
  const updateAppState = useDesktopStore((state) => state.updateAppState);
  const addNotification = useDesktopStore((state) => state.addNotification);
  useEffect(() => {
    if (!appState) {
      updateAppState(APP_ID, { items: initialComplianceItems });
    }
  }, [appState, updateAppState]);
  const handleCheckChange = (itemId: string, checked: boolean) => {
    if (!appState?.items) return;
    const updatedItems = appState.items.map((item: any) =>
      item.id === itemId ? { ...item, checked } : item
    );
    updateAppState(APP_ID, { items: updatedItems });
  };
  const handleGenerateReport = () => {
    addNotification({
      appId: APP_ID,
      icon: FileText,
      title: t('apps.compliance.generateReport'),
      message: 'Your compliance report is being generated and will be available shortly.',
    });
  };
  const handleAiAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      if (!appState?.items) {
        setIsAuditing(false);
        return;
      }
      let issuesResolved = 0;
      const auditedItems = appState.items.map((item: any) => {
        if (!item.checked) {
          issuesResolved++;
          return { ...item, checked: true };
        }
        return item;
      });
      updateAppState(APP_ID, { items: auditedItems });
      addNotification({
        appId: APP_ID,
        icon: ShieldCheck,
        title: t('apps.compliance.aiAuditCompleteTitle'),
        message: t('apps.compliance.aiAuditCompleteMessage', { count: issuesResolved }),
      });
      setIsAuditing(false);
    }, 2000);
  };
  const complianceItems = appState?.items || [];
  return (
    <ScrollArea className="h-full">
      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{t('apps.compliance.title')}</h1>
          <p className="text-muted-foreground">{t('apps.compliance.description')}</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('apps.compliance.checklist')}</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAiAudit} disabled={isAuditing}>
                {isAuditing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="mr-2 h-4 w-4" />
                )}
                {t('apps.compliance.runAiAudit')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {complianceItems.map((item: any) => (
                <div key={item.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={(checked) => handleCheckChange(item.id, !!checked)}
                  />
                  <label
                    htmlFor={item.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {item.label}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText /> {t('apps.compliance.generateReport')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center text-center space-y-4 h-full">
              <p className="text-muted-foreground">{t('apps.compliance.generateReportDesc')}</p>
              <Button onClick={handleGenerateReport}>{t('apps.compliance.generatePdf')}</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
};
export default ComplianceApp;