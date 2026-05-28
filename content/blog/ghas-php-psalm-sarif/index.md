---
title: "Setting Up GHAS Code Scanning for PHP with Psalm and SARIF"
subtitle: "When CodeQL doesn't support your language, bring your own scanner"
date: 2026-05-28
summary: "CodeQL has limited PHP support. Here's how to integrate Psalm as a custom SARIF scanner with GitHub Advanced Security."
toc: true
---

## The Problem: CodeQL's PHP Coverage Limitations

GitHub Advanced Security (GHAS) ships with CodeQL as its default static analysis engine. CodeQL excels at languages like JavaScript, Python, Java, C#, and Go — but PHP support is limited. As of writing, CodeQL's PHP coverage handles only a subset of vulnerability patterns and misses many common issues like type-safety violations, tainted data flows through frameworks like Laravel, and unsafe deserialization.

If your organisation runs PHP workloads and you've purchased GHAS licenses, you need an alternative scanner that can still surface results in the **Security** tab alongside your other repositories.

The good news: GitHub's code scanning accepts any tool that produces **SARIF** (Static Analysis Results Interchange Format) output. That means you can bring your own scanner.

## The Solution: Psalm Static Analysis + SARIF Output

[Psalm](https://psalm.dev/) is a mature static analysis tool for PHP that understands modern type annotations, supports taint analysis, and — critically — can output results in SARIF format via the `--output-format=sarif` flag (available since Psalm 5.x).

### Why Psalm Works Well Here

- **Taint analysis** — detects SQL injection, XSS, and other flow-based vulnerabilities
- **Type-level checks** — catches null dereference, incorrect argument types, and unreachable code
- **SARIF output** — native support, no extra tooling needed
- **Configurable severity** — map Psalm error levels to SARIF severity for filtering in GitHub

## GitHub Actions Workflow

Below is a production-ready workflow that runs Psalm and uploads SARIF results to GHAS:

```yaml
name: "GHAS: Psalm PHP Analysis"

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "30 6 * * 1" # Weekly Monday scan

permissions:
  security-events: write
  contents: read

jobs:
  psalm-sarif:
    name: Psalm Static Analysis
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: "8.3"
          extensions: mbstring, xml, curl
          tools: composer:v2

      - name: Install dependencies
        run: composer install --no-interaction --prefer-dist

      - name: Run Psalm with SARIF output
        run: |
          vendor/bin/psalm \
            --output-format=sarif \
            --report=psalm-results.sarif \
            --no-cache \
            --taint-analysis
        continue-on-error: true

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: psalm-results.sarif
          category: psalm
```

### Key Points in the Workflow

- **`permissions: security-events: write`** — required for the SARIF upload to succeed.
- **`continue-on-error: true`** — Psalm exits non-zero when it finds issues. Without this, the upload step would be skipped.
- **`--taint-analysis`** — enables the security-focused taint tracking. This is what catches injection vulnerabilities.
- **`category: psalm`** — groups results separately from CodeQL in the Security tab, so you can filter by tool.

## Psalm Configuration

You'll need a `psalm.xml` at the project root. Here's a minimal config tuned for security scanning:

```xml
<?xml version="1.0"?>
<psalm
    errorLevel="3"
    resolveFromConfigFile="true"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="https://getpsalm.org/schema/config"
    xsi:schemaLocation="https://getpsalm.org/schema/config vendor/vimeo/psalm/config.xsd"
    findUnusedBaselineEntry="true"
>
    <projectFiles>
        <directory name="src" />
        <directory name="app" />
        <ignoreFiles>
            <directory name="vendor" />
        </ignoreFiles>
    </projectFiles>

    <plugins>
        <pluginClass class="Psalm\LaravelPlugin\Plugin" />
    </plugins>
</psalm>
```

Set `errorLevel="3"` for a good balance between noise and coverage. Level 1 is strictest but produces too many results for initial adoption.

## How It Shows Up in the Security Tab

Once the workflow runs successfully:

1. Navigate to your repository's **Security** → **Code scanning alerts** tab.
2. Results appear grouped under the **psalm** tool (matching the `category` you set).
3. Each alert links back to the specific file and line, with Psalm's explanation of the issue.
4. You can dismiss alerts as false positives, won't fix, or used in tests — just like CodeQL results.
5. Branch protection rules that gate on code scanning work across all SARIF sources, so you can block PRs on Psalm findings too.

## Tips for Enterprise PoC Settings

If you're rolling this out as a proof of concept in an enterprise environment:

### Start with a Baseline

Run Psalm once and generate a baseline file to suppress existing issues:

```bash
vendor/bin/psalm --set-baseline=psalm-baseline.xml
```

Then reference it in `psalm.xml`:

```xml
<psalm errorBaseline="psalm-baseline.xml">
```

This lets you enforce "no new issues" without fixing the entire backlog on day one.

### Scope to Critical Paths First

For large codebases, limit the `<projectFiles>` to your most security-sensitive directories (authentication, payment processing, API controllers) rather than scanning everything.

### Combine with CodeQL

You can run both CodeQL and Psalm in parallel. CodeQL still catches some PHP issues (basic injection patterns), and having two tools increases coverage. The Security tab merges and deduplicates where possible.

### Set Up Alert Routing

Use code scanning alert webhooks or GitHub Actions to notify your security team via Slack or Jira when new critical/high severity alerts appear. The SARIF severity level maps directly from Psalm's error levels.

### Monitor Performance

Psalm with taint analysis on a large codebase can take 5–10 minutes. If CI time is a concern, run the full taint analysis only on the default branch schedule and use a lighter check (`--no-taint-analysis`) on PRs.
