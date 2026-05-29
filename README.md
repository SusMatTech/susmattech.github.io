# SusMat Lab Website

**Live site:** https://susmattech.github.io

This is the official website for the Sustainable Materials & Technologies (SusMat) Lab at the University of Maine.

---

## 🚀 Quick Start (First-time Setup)

### 1. Enable GitHub Pages
1. Go to **Settings → Pages**
2. Under **Source**, select **GitHub Actions**
3. Click Save

### 2. Add AI Bot API Key (for the update bot)
1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: your Anthropic API key (get one at https://console.anthropic.com)

### 3. Create the `lab-update` label
1. Go to **Issues → Labels**
2. Click **New label**, name it `lab-update`, choose a color

That's it! Your site is live.

---

## 📝 How to Update the Website

### Option A: AI Bot (Recommended — natural language)

Create a new Issue with title starting with `[UPDATE]`, then describe what you want in plain English. The bot will figure it out and update the site automatically.

**Examples:**

```
[UPDATE] Add news: Sanskar presented his research at the SEA symposium last week and won best poster award. Include a photo once uploaded.
```

```
[UPDATE] We just published a paper: "Flame-retardant PP/WF composites for LSAM" by Zhang X., Sanskar, et al. in Composites Part A, 2025. doi: 10.1016/xxx
```

```
[UPDATE] Add new PhD student: Maria Chen joined the lab in September 2025. She's working on lignin-based adhesives.
```

```
[UPDATE] Remove the PhD opening news item (we've filled the positions)
```

The bot will:
- Parse your message intelligently (no fixed format needed)
- Update the correct data file
- Commit the change
- Close the issue with a confirmation comment
- Site refreshes within ~2 minutes

### Option B: Direct JSON edit (for students with GitHub access)

Edit the files in the `data/` folder directly:

| File | What it controls |
|------|-----------------|
| `data/news.json` | News items (publications, awards, conferences, openings) |
| `data/members.json` | Lab members (PI, postdocs, students, alumni) |
| `data/publications.json` | Publications list |
| `data/lab.json` | Lab name, description, research areas |

**Adding a news item:**
```json
{
  "id": 10,
  "date": "2025-06-01",
  "type": "conference",
  "title": "Sanskar presents at TAPPI 2025",
  "body": "Sanskar presented our work on wood veneer forming at TAPPI PaperCon 2025.",
  "image": "assets/photos/tappi2025.jpg"
}
```
Valid `type` values: `publication`, `award`, `conference`, `opening`, `member`, `other`

**Adding a member:**
```json
{
  "id": 10,
  "name": "New Student Name",
  "role": "PhD Student",
  "title": "Graduate Research Assistant",
  "affiliation": "University of Maine",
  "bio": "Brief description of research.",
  "photo": "assets/photos/newstudent.jpg",
  "email": "student@maine.edu",
  "scholar": "",
  "linkedin": "",
  "joined": "2025"
}
```
Valid `role` values: `Principal Investigator`, `Postdoctoral Researcher`, `PhD Student`, `Master's Student`, `Undergraduate Researcher`, `Alumni`

---

## 🖼️ Adding Photos

1. Add photo files to `assets/photos/` (JPG or PNG, ideally square for member photos)
2. Reference them in the JSON as `"photo": "assets/photos/filename.jpg"`

For news images, recommended size: ~800×400px landscape.
For member photos: ~300×300px square.

---

## 📁 File Structure

```
susmattech.github.io/
├── index.html              ← Main website (all pages)
├── data/
│   ├── lab.json            ← Lab info & research areas
│   ├── news.json           ← News & announcements
│   ├── members.json        ← Team members
│   └── publications.json   ← Publications list
├── assets/
│   └── photos/             ← Member & news photos
└── .github/
    └── workflows/
        ├── deploy.yml      ← Auto-deploy on push
        └── ai-update-bot.yml ← AI update bot
```

---

## 👥 Student Collaborator Access

To give students edit access:
1. Go to **Settings → Collaborators**
2. Add their GitHub username
3. Set role to **Write** (they can edit JSON files and open Issues)
4. Students can use the AI bot (Issues) without needing to understand code

---

## 🎨 Customization

To change colors or fonts, edit the CSS variables at the top of `index.html`:
```css
:root {
  --forest: #1a3a2a;   /* Dark green (nav, headings) */
  --moss:   #2d5e3e;   /* Medium green */
  --gold:   #c9a84c;   /* Accent gold */
  --cream:  #f5f0e8;   /* Background cream */
}
```

---

## ❓ Support

Contact Dr. Zhang or open an Issue labeled `help`.
