import fs from 'fs';
import https from 'https';

const issueTitle = process.env.ISSUE_TITLE || '';
const issueBody  = process.env.ISSUE_BODY  || '';
const apiKey     = process.env.GEMINI_API_KEY;
const today      = new Date().toISOString().split('T')[0];

// Load current data
const news    = JSON.parse(fs.readFileSync('data/news.json',         'utf8'));
const members = JSON.parse(fs.readFileSync('data/members.json',      'utf8'));
const pubs    = JSON.parse(fs.readFileSync('data/publications.json', 'utf8'));

const maxId = arr => Math.max(...arr.map(x => x.id), 0);

const prompt = `You are the AI update bot for the SusMat Lab website.
Read the update request and return a single valid JSON object.

CRITICAL RULES:
- Return ONLY raw JSON. No markdown. No backticks. No explanation.
- ALL string values in JSON must use English only (translate Chinese content to English).
- Do not truncate the JSON. The entire response must be one complete, valid JSON object.

Today: ${today}
News max id: ${maxId(news)}
Members max id: ${maxId(members)}
Publications max id: ${maxId(pubs)}

Required JSON structure:
{"action":"add","target":"news","data":{"date":"YYYY-MM-DD","type":"conference","title":"English title here","body":"English description here.","image":""},"summary":"English summary sentence"}

Field options:
- action: add / update / delete
- target: news / members / publications
- news type: publication / award / conference / opening / member / other
- member role: Principal Investigator / Postdoctoral Researcher / PhD Student / Masters Student / Undergraduate Researcher / Alumni
- For add: omit id field
- For update/delete: include id of existing record

Update request:
Title: ${issueTitle}
Body: ${issueBody}`;

const payload = JSON.stringify({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    maxOutputTokens: 512,
    temperature: 0.0,
    responseMimeType: "application/json"
  }
});

console.log('Calling Gemini API...');

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
      catch(e) { reject(new Error('Bad API response: ' + body.slice(0, 300))); }
    });
  });
  req.on('error', reject);
  req.write(payload);
  req.end();
});

if (!result.candidates?.[0]) {
  throw new Error('No candidates returned: ' + JSON.stringify(result).slice(0, 300));
}

const rawText = result.candidates[0].content.parts[0].text.trim();
console.log('Gemini response:', rawText.slice(0, 400));

// Parse JSON robustly
let update;
try {
  // Remove markdown fences if present
  const clean = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  update = JSON.parse(clean);
} catch(e) {
  // Try to extract first complete JSON object
  const match = rawText.match(/\{[\s\S]*\}/);
  if (match) {
    try { update = JSON.parse(match[0]); }
    catch(e2) { throw new Error('Cannot parse JSON: ' + rawText.slice(0, 300)); }
  } else {
    throw new Error('No JSON found in response: ' + rawText.slice(0, 300));
  }
}

console.log('Parsed:', update.action, '->', update.target);

// Select target file
let targetData, targetFile;
if      (update.target === 'news')         { targetData = news;    targetFile = 'data/news.json'; }
else if (update.target === 'members')      { targetData = members; targetFile = 'data/members.json'; }
else if (update.target === 'publications') { targetData = pubs;    targetFile = 'data/publications.json'; }
else throw new Error('Unknown target: ' + update.target);

// Apply action
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
