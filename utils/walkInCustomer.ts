import type { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

/** Stable Party name (not locale-dependent) for POS / default retail sales. */
export const WALK_IN_CUSTOMER_NAME = 'Walk-In Customer';

export function getWalkInCustomerName(): string {
  return WALK_IN_CUSTOMER_NAME;
}

async function resolveReceivableAccountName(fyo: Fyo): Promise<string | null> {
  for (const name of ['Debtors', 'Accounts Receivable']) {
    if (await fyo.db.exists(ModelNameEnum.Account, name)) {
      return name;
    }
  }

  const rows = (await fyo.db.getAll(ModelNameEnum.Account, {
    fields: ['name'],
    filters: { accountType: 'Receivable', isGroup: false },
    limit: 1,
  })) as { name: string }[];

  return rows[0]?.name ?? null;
}

/** Idempotent: creates retail walk-in customer when COA has a receivable account. */
export async function ensureWalkInCustomer(fyo: Fyo): Promise<void> {
  if (await fyo.db.exists(ModelNameEnum.Party, WALK_IN_CUSTOMER_NAME)) {
    return;
  }

  const defaultAccount = await resolveReceivableAccountName(fyo);
  if (!defaultAccount) {
    return;
  }

  const doc = fyo.doc.getNewDoc(ModelNameEnum.Party, {
    name: WALK_IN_CUSTOMER_NAME,
    role: 'Customer',
    defaultAccount,
  });
  await doc.sync();
}
