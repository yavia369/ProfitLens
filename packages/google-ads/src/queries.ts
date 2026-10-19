import { isLocalDate } from "@profitlens/finance";
import { GoogleAdsError } from "./errors";

/** GAQL documents (v26). Dates are in the ad account's time zone (`customer.time_zone`). */

export const CUSTOMER_QUERY = `
  SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account
  FROM customer LIMIT 1`;

/** Accounts under a manager (level 1 = direct children); queried with login-customer-id = the manager. */
export const CUSTOMER_CLIENTS_QUERY = `
  SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone,
    customer_client.manager, customer_client.level, customer_client.status, customer_client.test_account
  FROM customer_client WHERE customer_client.level <= 1`;

/** Daily spend per campaign (campaign level is the store-level source of truth, never mixed with account rows). */
export function campaignDailyQuery(from: string, to: string): string {
  if (!isLocalDate(from) || !isLocalDate(to) || from > to) throw new GoogleAdsError(`invalid date range ${from}..${to}`, "config");
  return `
  SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,
    metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${from}' AND '${to}'`;
}
