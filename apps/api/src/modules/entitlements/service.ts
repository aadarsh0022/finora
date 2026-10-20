import { entitlementSchema, type Entitlement } from '@finora/contracts';
import type { AuthContext } from '../auth/service';

// Implementations belong only in trusted server composition. A future billing
// adapter must verify provider signatures, app/package, product, owner and expiry
// before returning a grant. No request body or backup can supply this adapter.
export interface EntitlementProvider {
  verifiedGrant(userId: string): Promise<{ expiresAt: string } | null>;
}
const unavailableBilling: EntitlementProvider = {
  async verifiedGrant() {
    return null;
  },
};
export async function getEntitlement(
  context: AuthContext,
  provider: EntitlementProvider = unavailableBilling,
  now = new Date(),
): Promise<Entitlement> {
  const grant = await provider.verifiedGrant(context.user.id);
  const valid =
    grant !== null &&
    Number.isFinite(Date.parse(grant.expiresAt)) &&
    new Date(grant.expiresAt) > now;
  return entitlementSchema.parse({
    tier: valid ? 'PREMIUM' : 'FREE',
    source: valid ? 'TRUSTED_PROVIDER' : 'NONE',
    expiresAt: valid ? grant.expiresAt : null,
    billingAvailable: false,
    manualTrackingAvailable: true,
  });
}
