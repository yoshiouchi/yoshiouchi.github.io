---
title: "Configuring SAML SSO for a GitHub Org with Microsoft Entra ID"
subtitle: "A walkthrough including the NameID gotcha"
date: 2026-05-21
summary: "Step-by-step guide to connecting a GitHub organisation to Microsoft Entra ID with SAML SSO, including how to fix the NameID mismatch error."
toc: true
---

## Prerequisites

Before you begin, make sure you have:

- **Microsoft Entra ID (Azure AD) access** — at minimum a P1 license or a free trial tenant. You need the ability to create Enterprise Applications.
- **GitHub organisation admin** — you must be an owner of the GitHub org you're configuring. This works with GitHub Enterprise Cloud; free/Team plans don't support SAML SSO.
- **A test user** — at least one Entra user whose email matches a GitHub account, for validating the flow before enforcing SSO.

## Entra ID App Registration and SAML Configuration

### Step 1: Add the GitHub Enterprise Application

1. In the [Azure Portal](https://portal.azure.com), navigate to **Microsoft Entra ID** → **Enterprise Applications** → **New Application**.
2. Search for **"GitHub"** in the gallery and select **GitHub Enterprise Cloud – Organization**.
3. Give it a name (e.g., `GitHub SSO - YourOrg`) and click **Create**.

### Step 2: Configure SAML Settings

In the Enterprise Application, go to **Single sign-on** → **SAML** and configure:

| Setting | Value |
|---------|-------|
| Identifier (Entity ID) | `https://github.com/orgs/YOUR_ORG` |
| Reply URL (ACS URL) | `https://github.com/orgs/YOUR_ORG/saml/consume` |
| Sign on URL | `https://github.com/orgs/YOUR_ORG/sso` |

### Step 3: Configure Claims

This is where most people get tripped up. The default claim configuration **will not work** without adjustment.

Under **Attributes & Claims**, configure:

| Claim | Value |
|-------|-------|
| `NameID` | `user.mail` (format: Email Address) |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `user.userprincipalname` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `user.mail` |

> **Critical:** The NameID **must** be set to `user.mail` with the Email Address format. See the NameID section below for why.

### Step 4: Download the Certificate and Metadata

Still on the SAML configuration page:

1. Download the **Certificate (Base64)** — you'll paste this into GitHub.
2. Copy the **Login URL** (e.g., `https://login.microsoftonline.com/{tenant-id}/saml2`).
3. Copy the **Azure AD Identifier** (Entity ID on the Entra side).

### Step 5: Assign Users

Under **Users and groups**, assign the Entra users (or groups) that should have access to the GitHub org. Only assigned users can authenticate via SSO.

## GitHub Organisation SSO Settings

1. In GitHub, go to your organisation → **Settings** → **Authentication security**.
2. Check **Enable SAML authentication**.
3. Fill in:
   - **Sign on URL** — the Login URL from Entra
   - **Issuer** — the Azure AD Identifier
   - **Public certificate** — paste the Base64 certificate content
4. Click **Test SAML configuration** — this opens a new window and attempts to authenticate you via Entra.
5. If the test succeeds, save the configuration.

At this point SSO is enabled but **not enforced**. Members can still access the org without SSO. To require SSO for all members, check **Require SAML SSO authentication** — but only do this after validating with your test users.

## The NameID Mismatch Error and How to Fix It

### The Symptom

After configuring everything, you click "Test SAML configuration" and get:

```
Your SAML Response must contain exactly one NameID that matches 
one of the following:
  - An existing verified email on the account
  - An email provisioned via SCIM
```

### The Cause

GitHub matches the SAML `NameID` against the **verified email addresses** on the user's GitHub account. If Entra sends the `user.userprincipalname` (e.g., `yoshio@contoso.onmicrosoft.com`) as the NameID but the GitHub account has `yoshio@contoso.com` verified, it won't match.

Common mismatches:

| Entra sends | GitHub expects |
|-------------|---------------|
| `user.userprincipalname` (`yoshio@contoso.onmicrosoft.com`) | Verified email (`yoshio@contoso.com`) |
| `user.objectid` (a GUID) | An email address |
| `user.mail` but format set to "Persistent" | Email address format |

### The Fix

1. In Entra → Enterprise App → **Single sign-on** → **Attributes & Claims**.
2. Click **Edit** on the NameID claim.
3. Set **Source attribute** to `user.mail`.
4. Set **Name identifier format** to **Email address** (`urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`).
5. Save and re-test.

If your users' `mail` attribute is empty in Entra (common with cloud-only accounts that were never synced from on-prem AD), you can use `user.userprincipalname` instead — but then the UPN must exactly match a verified email on the GitHub account.

### Verification Checklist

```bash
# Check what email GitHub sees during SAML — enable debug logging:
# In GitHub org Settings → Authentication security → SAML → 
# Look at the "NameID" value in the test response

# Ensure the email is verified on the GitHub account:
# GitHub user → Settings → Emails → must show "Verified" badge
```

## SCIM vs SSO: What's the Difference and Which You Need

These are complementary but separate features:

| Feature | SAML SSO | SCIM Provisioning |
|---------|----------|-------------------|
| **What it does** | Authenticates users at login | Syncs user lifecycle (create/update/deactivate) |
| **Direction** | User-initiated (login flow) | System-initiated (background sync) |
| **Required for** | Enforcing identity provider login | Auto-provisioning org membership, team sync |
| **Without it** | Users log in with GitHub credentials | You manually invite/remove org members |

### When You Need Only SSO

- You want to enforce that members authenticate through Entra
- You're fine managing org membership manually
- You have a small org (< 50 members)

### When You Should Add SCIM

- You want users automatically added to the org when assigned in Entra
- You want users automatically removed when unassigned or disabled in Entra
- You need team membership to sync with Entra groups
- You have a large org where manual membership management is unsustainable

### Enabling SCIM

1. In the Entra Enterprise App, go to **Provisioning** → **Automatic**.
2. Set the **Tenant URL** to `https://api.github.com/scim/v2/organizations/YOUR_ORG`.
3. Generate a **Personal Access Token** (classic) with `admin:org` scope on a GitHub org owner account, and paste it as the **Secret Token**.
4. Click **Test Connection** to verify.
5. Under **Mappings**, configure user attribute mappings — at minimum map `mail` → `emails[type eq "work"].value` and `displayName` → `displayName`.
6. Set the provisioning status to **On** and save.

> **Note:** SCIM provisioning requires SAML SSO to be configured and enforced first. You cannot use SCIM without SSO.

## Common Pitfalls

- **Don't enforce SSO before testing** — if you lock yourself out, you'll need to contact GitHub Support or use a recovery code.
- **Recovery codes** — download and store the org's SSO recovery codes before enforcing. These let an owner bypass SSO if Entra goes down.
- **PAT and SSH key authorisation** — after SSO enforcement, members must authorise their existing PATs and SSH keys for the org. Remind your team, or they'll get 403s on git operations.
- **Bot accounts** — service accounts (CI bots, deploy keys) need to either use a machine user with an Entra identity or use fine-grained PATs that are SSO-authorised.
