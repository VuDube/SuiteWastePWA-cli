import React from 'react';
import {
  LayoutDashboard,
  Map,
  ShieldCheck,
  CreditCard,
  Store,
  GraduationCap,
  Bot,
  Settings,
  LucideProps,
} from 'lucide-react';
import DashboardApp from '@/components/apps/DashboardApp';
import OperationsApp from '@/components/apps/OperationsApp';
import ComplianceApp from '@/components/apps/ComplianceApp';
import PaymentsApp from '@/components/apps/PaymentsApp';
import MarketplaceApp from '@/components/apps/MarketplaceApp';
import TrainingApp from '@/components/apps/TrainingApp';
import AssistantApp from '@/components/apps/AssistantApp';
import SettingsApp from '@/components/apps/SettingsApp';
export interface AppConfig {
  id: string;
  title: string; // This will now be a translation key
  icon: React.ComponentType<LucideProps>;
  component: React.ComponentType;
  pinned?: boolean;
}
export const APPS: AppConfig[] = [
  {
    id: 'dashboard',
    title: 'apps.dashboard.title',
    icon: LayoutDashboard,
    component: DashboardApp,
    pinned: true,
  },
  {
    id: 'operations',
    title: 'apps.operations.title',
    icon: Map,
    component: OperationsApp,
    pinned: true,
  },
  {
    id: 'compliance',
    title: 'apps.compliance.title',
    icon: ShieldCheck,
    component: ComplianceApp,
  },
  {
    id: 'payments',
    title: 'apps.payments.title',
    icon: CreditCard,
    component: PaymentsApp,
  },
  {
    id: 'marketplace',
    title: 'apps.marketplace.title',
    icon: Store,
    component: MarketplaceApp,
  },
  {
    id: 'training',
    title: 'apps.training.title',
    icon: GraduationCap,
    component: TrainingApp,
  },
  {
    id: 'assistant',
    title: 'apps.assistant.title',
    icon: Bot,
    component: AssistantApp,
    pinned: true,
  },
  {
    id: 'settings',
    title: 'apps.settings.title',
    icon: Settings,
    component: SettingsApp,
  },
];