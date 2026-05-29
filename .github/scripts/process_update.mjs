import fs from 'fs';
import https from 'https';
import path from 'path';

const issueTitle = process.env.ISSUE_TITLE || '';
const issueBody  = process.env.ISSUE_BODY  || '';
const apiKey     = process.env.GEMINI_API_KEY;
const serviceAccountJson = process.env.GDRIVE_SERVICE_ACCOUNT;
const today      = new Date().toISOString().split('T')[0];

const FOLDER_ID  = '1YnpHFFJjs6eNMZ-m0zo9NKLBIGpe3ax-';

// Load current data
const news    = JSON.parse(fs.readFileSync('data/news.json',         'utf8'));
const members = JSON.parse(fs.readFileSync('data/members.json',      'utf8'));
const pubs    = JSON.parse(fs.readFileSync('data/publications.json', 'utf8'));
const maxId   = arr => Math.max(...arr.map(x => x.id), 0);

// ── Google Drive Auth (Service Account JWT) ──────────────────────────────────
async function getAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const tokenBody = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const data = JSON.parse(body);
        if (data.access_token) resolve(data.access_token);
        else reject(new Error('Token error: ' + body));
      });
    });
    req.on('error', reject);
    req.write(tokenBody);
    req.end();
  });
}

// ── List files in Drive folder ───────────────────────────────────────────────
async function listDriveFiles(token) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(`'${FOLDER_ID}' in parents and mimeType contains 'image/' and trashed=false`);
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc&pageSize=50`,
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body).files || []));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Download file from Drive ─────────────────────────────────────────────────
async function downloadFile(token, fileId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${fileId}?alt=media`,
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        const loc = res.headers.location;
        https.get(loc, res2 => {
          const chunks = [];
          res2.on('data', d => chunks.push(d));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Call Gemini API ──────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.0,
      responseMimeType: 'application/json'
    }
  });

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('Bad API response: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  if (!result.candidates?.[0]) throw new Error('No candidates: ' + JSON.stringify(result).slice(0, 200));
  return result.candidates[0].content.parts[0].text.trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Starting update bot...');

// Step 1: Get Drive files list
let driveFiles = [];
let driveToken = null;
if (serviceAccountJson) {
  try {
    console.log('Fetching Drive file list...');
    driveToken = await getAccessToken(serviceAccountJson);
    driveFiles = await listDriveFiles(driveToken);
    console.log(`Found ${driveFiles.length} photos in Drive:`, driveFiles.map(f => f.name).join(', '));
  } catch(e) {
    console.warn('Drive access failed (continuing without photos):', e.message);
  }
}

// Step 2: Ask Gemini to parse the update + match photo
const fileListText = driveFiles.length
  ? `Available photos in Google Drive folder:\n${driveFiles.map(f => `- ${f.name} (id: ${f.id})`).join('\n')}`
  : 'No photos available in Google Drive.';

const prompt = `You are the AI update bot for the SusMat Lab website at the University of Maine.
Read the update request and return a single valid JSON object.

CRITICAL RULES:
- Return ONLY raw JSON. No markdown. No backticks. No explanation.
- ALL string values must be in English.
- Complete valid JSON only, never truncate.

Today: ${today}
News max id: ${maxId(news)}
Members max id: ${maxId(members)}
Publications max id: ${maxId(pubs)}

${fileListText}

Required JSON structure:
{"action":"add","target":"news","data":{"date":"YYYY-MM-DD","type":"conference","title":"English title","body":"English description.","image":""},"matched_photo_id":"DRIVE_FILE_ID_OR_EMPTY","summary":"English summary"}

Rules:
- action: add / update / delete
- target: news / members / publications
- news type: publication / award / conference / opening / member / other
- member role: Principal Investigator / Postdoctoral Researcher / PhD Student / Masters Student / Undergraduate Researcher / Alumni
- For add: omit id field. For update/delete: include existing record id.
- matched_photo_id: if the request mentions a photo OR there is a recently uploaded photo that clearly matches this news, put its Drive file id here. Otherwise leave empty string "".
- image field: leave as "" (will be filled automatically if photo matched)

Update request:
Title: ${issueTitle}
Body: ${issueBody}`;

console.log('Calling Gemini...');
const rawText = await callGemini(prompt);
console.log('Gemini response:', rawText.slice(0, 400));

let update;
try {
  const clean = rawText.replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
  update = JSON.parse(clean);
} catch(e) {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (match) update = JSON.parse(match[0]);
  else throw new Error('Cannot parse JSON: ' + rawText.slice(0, 200));
}

console.log('Action:', update.action, '-> Target:', update.target);

// Step 3: If photo matched, download and save to assets/photos/
if (update.matched_photo_id && driveToken) {
  try {
    console.log('Downloading matched photo:', update.matched_photo_id);
    const matchedFile = driveFiles.find(f => f.id === update.matched_photo_id);
    const ext = path.extname(matchedFile.name) || '.jpg';
    const safeName = matchedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    fs.mkdirSync('assets/photos', { recursive: true });
    const imgBuffer = await downloadFile(driveToken, update.matched_photo_id);
    const localPath = `assets/photos/${safeName}`;
    fs.writeFileSync(localPath, imgBuffer);
    update.data.image = localPath;
    console.log('Photo saved to:', localPath);
  } catch(e) {
    console.warn('Photo download failed (continuing without photo):', e.message);
  }
}

// Step 4: Apply action to data
let targetData, targetFile;
if      (update.target === 'news')         { targetData = news;    targetFile = 'data/news.json'; }
else if (update.target === 'members')      { targetData = members; targetFile = 'data/members.json'; }
else if (update.target === 'publications') { targetData = pubs;    targetFile = 'data/publications.json'; }
else throw new Error('Unknown target: ' + update.target);

if (update.action === 'add') {
  update.data.id = maxId(targetData) + 1;
  targetData.push(update.data);
  console.log('Added record id:', update.data.id);
} else if (update.action === 'update') {
  const idx = targetData.findIndex(x => x.id === update.data.id);
  if (idx === -1) throw new Error('Record id not found: ' + update.data.id);
  targetData[idx] = { ...targetData[idx], ...update.data };
  console.log('Updated record id:', update.data.id);
} else if (update.action === 'delete') {
  const idx = targetData.findIndex(x => x.id === update.data.id);
  if (idx === -1) throw new Error('Record id not found: ' + update.data.id);
  targetData.splice(idx, 1);
  console.log('Deleted record id:', update.data.id);
} else {
  throw new Error('Unknown action: ' + update.action);
}

fs.writeFileSync(targetFile, JSON.stringify(targetData, null, 2));
fs.writeFileSync('update_summary.txt', update.summary || 'Lab website updated.');
console.log('Done:', update.summary);
