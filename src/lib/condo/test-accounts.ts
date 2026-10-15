import { asRole, type Role } from "@/lib/condo/roles";
import { TEST_ACCOUNTS as RAW, TEST_PASSWORD } from "../../../scripts/test-accounts.mjs";

export { TEST_PASSWORD };

export const TEST_ACCOUNTS: {
  role: Role;
  label: string;
  email: string;
  name: string;
  unit: string;
  phone: string;
}[] = RAW.map((account) => ({ ...account, role: asRole(account.role) }));