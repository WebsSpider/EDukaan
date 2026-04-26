import { DocValue } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { ListViewSettings, ValidationMap } from 'fyo/model/types';
import { ValidationError } from 'fyo/utils/errors';
import bcrypt from 'bcryptjs';

export class User extends Doc {
  fullName?: string;
  username?: string;
  passwordHash?: string;
  password?: string;
  role?: 'Admin' | 'User';
  disabled?: boolean;
  canAccessGetStarted?: boolean;
  canAccessDashboard?: boolean;
  canAccessSales?: boolean;
  canAccessPurchases?: boolean;
  canAccessCommon?: boolean;
  canAccessReports?: boolean;
  canAccessInventory?: boolean;
  canAccessPOS?: boolean;
  canAccessSetup?: boolean;

  validations: ValidationMap = {
    password: (value: DocValue) => {
      if (!value) {
        return;
      }

      if ((value as string).length < 6) {
        throw new ValidationError(this.fyo.t`Password must be at least 6 characters.`);
      }
    },
  };

  async beforeSync(): Promise<void> {
    await super.beforeSync();

    if (this.password && this.role === 'Admin') {
      const loggedInUserRole = this.fyo.config.get(
        'loggedInUserRole'
      ) as string | null;
      if (loggedInUserRole === 'User') {
        throw new ValidationError(
          this.fyo.t`User role cannot change Admin password.`
        );
      }
    }

    if (this.password) {
      this.passwordHash = await bcrypt.hash(this.password, 10);
      this.password = '';
    }
  }

  async beforeDelete(): Promise<void> {
    await super.beforeDelete();

    if (this.role !== 'Admin') {
      return;
    }

    const admins = await this.fyo.db.getAll('User', {
      fields: ['name'],
      filters: { role: 'Admin' },
    });

    if (admins.length <= 1) {
      throw new ValidationError(this.fyo.t`Cannot delete the last Admin user.`);
    }
  }

  static getListViewSettings(): ListViewSettings {
    return {
      columns: [
        'name',
        'fullName',
        'username',
        'role',
        'canAccessSales',
        'canAccessPurchases',
        'canAccessCommon',
        'canAccessReports',
        'canAccessSetup',
        'disabled',
      ],
    };
  }
}
