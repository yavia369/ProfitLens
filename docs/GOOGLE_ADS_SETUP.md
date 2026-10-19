# Connect Google Ads (service account)

ProfitLens reads **ad spend only** (cost per campaign per day). It never changes campaigns, budgets or bids.
For your own accounts it uses a Google Cloud **service account**: a robot user you add to Google Ads, the same way
you would add a colleague. No password is shared, and access can be removed from Google Ads at any time.

Verified against developers.google.com on 2026-10-19: Google Ads API v26; developer tokens were retired on
2026-09-09 and API access levels now belong to the Google Cloud project.

Takes about 15 minutes, plus Google's review of step 2 (Explorer access is usually quick).

## 1. Create a Google Cloud project and enable the API
1. Go to https://console.cloud.google.com/ and sign in with the Google account that manages your ads.
2. Top bar → project picker → **New project**. Name it `ProfitLens`. Create, then select it.
3. Menu → **APIs & Services → Library**, search **Google Ads API**, open it and click **Enable**.

## 2. Request API access for the project
1. Open the **Google Ads API** page of the project (APIs & Services → Enabled APIs → Google Ads API).
2. Find the **API access** / access level section and **apply for Explorer access**.
   Explorer allows 2,880 operations a day on real accounts. ProfitLens needs a handful per day.
3. Wait for the approval email. Without it, calls to real accounts fail with
   `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (ProfitLens shows this error in the Sync Center).

## 3. Create the service account and its key
1. Menu → **IAM & Admin → Service accounts → Create service account**.
2. Name: `profitlens-reader`. Click **Create and continue**, skip the optional role steps, then **Done**.
3. Open the new service account → **Keys** tab → **Add key → Create new key → JSON → Create**.
   A `.json` file downloads. Treat it like a password: don't email it or paste it into chats.
4. Copy the service account's **email** (it looks like `profitlens-reader@<project>.iam.gserviceaccount.com`).

## 4. Give it read access in Google Ads
1. Sign in to https://ads.google.com as an administrator of the ad account.
2. **Admin → Access and security → Users → +**.
3. Paste the service account email, choose **Read only**, and click **Add account**.
   If you manage several accounts under a **manager account**, add it to the manager account instead and note the
   manager's customer ID (10 digits, top right in Google Ads).

## 5. Store the key in the cloud environment
In the Claude Code cloud environment settings (environment menu in the session title bar → **Edit**), add under
**Environment variables** (not Network secrets — ProfitLens must read the values itself):

```
GOOGLE_ADS_SERVICE_ACCOUNT_KEY=<the whole JSON key on one line, or the file base64-encoded>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<manager account ID, digits only — only if you used a manager account>
```

To get the key on one line: open the `.json` file in a text editor and join it into a single line, or base64-encode
the file (`base64 -w0 key.json` on Linux, `base64 -i key.json` on macOS). Both forms are accepted.

Then start a new session and say **"Continue Phase 6"**. ProfitLens will verify access, list the ad accounts it can
see, ask you which store each account belongs to, and import spend.

Once ProfitLens is deployed (Phase 9), the same key can be pasted in **Settings → Stores & integrations → Google
Ads** instead; it is stored encrypted (AES-256-GCM) and never shown again.

## Removing access
Remove the service account user in Google Ads (Admin → Access and security), or delete its key in Google Cloud.
ProfitLens then marks the connection as needing attention and keeps the spend it already imported.
