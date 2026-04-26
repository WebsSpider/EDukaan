import { fyo } from 'src/initFyo';

export type ModuleName =
  | 'get-started'
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'common-entries'
  | 'reports'
  | 'inventory'
  | 'pos'
  | 'setup';

const allModules: ModuleName[] = [
  'get-started',
  'dashboard',
  'sales',
  'purchases',
  'common-entries',
  'reports',
  'inventory',
  'pos',
  'setup',
];

export function getAllowedModulesForCurrentUser(): Set<ModuleName> {
  const role = (fyo.config.get('loggedInUserRole') as string | null) ?? null;
  if (role === 'Admin') {
    return new Set(allModules);
  }

  const modules = (fyo.config.get('loggedInUserModules') as string[] | null) ?? [];
  const allowed = new Set<ModuleName>();
  for (const moduleName of modules) {
    if (allModules.includes(moduleName as ModuleName)) {
      allowed.add(moduleName as ModuleName);
    }
  }

  return allowed;
}

export function hasModuleAccess(moduleName: ModuleName): boolean {
  return getAllowedModulesForCurrentUser().has(moduleName);
}

export function getModuleFromPath(path: string): ModuleName | null {
  if (path === '/') {
    return 'dashboard';
  }

  if (path.startsWith('/get-started')) {
    return 'get-started';
  }

  if (path.startsWith('/chart-of-accounts') || path.startsWith('/import-wizard')) {
    return 'setup';
  }

  if (path.startsWith('/settings') || path.startsWith('/template-builder')) {
    return 'setup';
  }

  if (path.startsWith('/customize-form')) {
    return 'setup';
  }

  if (path.startsWith('/pos')) {
    return 'pos';
  }

  if (path.startsWith('/report/')) {
    return 'reports';
  }

  if (path.startsWith('/report-print/')) {
    return 'reports';
  }

  if (path.startsWith('/list/')) {
    const schemaName = path.split('/')[2] ?? '';

    if (
      ['SalesInvoice', 'SalesQuote', 'Lead', 'LoyaltyProgram', 'CouponCode'].includes(
        schemaName
      )
    ) {
      return 'sales';
    }

    if (schemaName === 'Payment') {
      const title = decodeURIComponent(path.split('/')[3] ?? '');
      if (title.includes('Purchase')) {
        return 'purchases';
      }
      if (title.includes('Sales')) {
        return 'sales';
      }
      return 'common-entries';
    }

    if (['PurchaseInvoice'].includes(schemaName)) {
      return 'purchases';
    }

    if (
      ['JournalEntry', 'PriceList', 'Party', 'Item', 'Tax', 'PrintTemplate', 'User'].includes(
        schemaName
      )
    ) {
      return 'common-entries';
    }

    if (['StockMovement', 'Shipment', 'PurchaseReceipt'].includes(schemaName)) {
      return 'inventory';
    }

    return 'common-entries';
  }

  if (path.startsWith('/edit/')) {
    const schemaName = path.split('/')[2] ?? '';
    return getModuleFromPath(`/list/${schemaName}`);
  }

  if (path.startsWith('/print/')) {
    const schemaName = path.split('/')[2] ?? '';
    return getModuleFromPath(`/list/${schemaName}`);
  }

  return null;
}

export function getDefaultAllowedRoute(): string {
  const ordered: Array<{ module: ModuleName; route: string }> = [
    { module: 'sales', route: '/list/SalesInvoice' },
    { module: 'purchases', route: '/list/PurchaseInvoice' },
    { module: 'common-entries', route: '/list/JournalEntry' },
    { module: 'reports', route: '/report/GeneralLedger' },
    { module: 'inventory', route: '/list/StockMovement' },
    { module: 'pos', route: '/pos' },
    { module: 'dashboard', route: '/' },
    { module: 'get-started', route: '/get-started' },
    { module: 'setup', route: '/settings' },
  ];

  for (const item of ordered) {
    if (hasModuleAccess(item.module)) {
      return item.route;
    }
  }

  return '/list/SalesInvoice';
}
