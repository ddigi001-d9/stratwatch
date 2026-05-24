# STRATWATCH — Go-Live Instructions

Zero servers. Zero ongoing cost. GitHub runs the intelligence job, GitHub Pages hosts the site.
Your API key never touches the frontend. Friends get a PWA they can add to their home screen.

---

## WHAT THIS IS

```
GitHub Actions (cron 2x/day)
  → calls Anthropic API (web search on)
  → fetches Polymarket prices
  → writes docs/intelligence.json
  → commits to repo

GitHub Pages (always on, free)
  → serves docs/ as a static site
  → index.html reads intelligence.json
  → no server, no API calls from browser
  → friends add to iPhone home screen as PWA
```

Token cost: ~$0.10–0.30 per run × 2 runs/day = **~$6–18/month**

---

## STEP 1 — Create the GitHub repo

1. Go to **github.com** → click the **+** → **New repository**
2. Name it: `stratwatch`
3. Set to **Private** (keeps your intelligence data private)
4. Do NOT check "Initialize with README"
5. Click **Create repository**

---

## STEP 2 — Push these files to GitHub

Open Terminal on your Mac:

```bash
cd /path/to/stratwatch-static

git init
git add .
git commit -m "initial stratwatch setup"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/stratwatch.git
git push -u origin main
```

Replace YOUR_USERNAME with your actual GitHub username.

---

## STEP 3 — Add your API key as a GitHub Secret

1. Your repo on GitHub → **Settings**
2. Left sidebar → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `ANTHROPIC_API_KEY`
5. Value: your key (sk-ant-...)
6. Click **Add secret**

The key is encrypted. It never appears in code or logs.

---

## STEP 4 — Enable GitHub Pages

1. Your repo → **Settings**
2. Left sidebar → **Pages**
3. Source: **Deploy from a branch**
4. Branch: **main** / Folder: **/ docs**
5. Click **Save**

Your site URL will be: `https://YOUR_USERNAME.github.io/stratwatch/`

Wait ~60 seconds for it to go live.

---

## STEP 5 — Run first intelligence report

1. Your repo → **Actions** tab
2. Click **STRATWATCH Intelligence Run** (left sidebar)
3. Click **Run workflow** → **Run workflow**
4. Wait 2–4 minutes
5. Reload your GitHub Pages URL — live data will appear

---

## STEP 6 — Share with friends

URL: `https://YOUR_USERNAME.github.io/stratwatch/`

iPhone install: Safari → Share button → Add to Home Screen → Add

Must use Safari (not Chrome) on iPhone for PWA install to work.

---

## SCHEDULE

Runs automatically at:
- 6:00 AM UTC (1am ET) — overnight refresh
- 6:00 PM UTC (1pm ET) — afternoon refresh

To change, edit `.github/workflows/intelligence.yml` cron lines.

---

## COST

~$6–18/month in Anthropic API tokens (2 calls × 2 runs/day × 30 days).
GitHub Actions and Pages are free.

---

## TROUBLESHOOTING

- **Workflow fails** → Check Actions log for error. Most likely: secret name wrong (must be exactly ANTHROPIC_API_KEY)
- **Pages shows 404** → Verify folder is set to /docs in Pages settings
- **Shows placeholder data** → Run the workflow manually first (Step 5)
- **Friends can't install** → Must use Safari on iPhone, not Chrome
