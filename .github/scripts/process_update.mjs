import fs from 'fs';
import https from 'https';

const issueTitle = process.env.ISSUE_TITLE || '';
const issueBody  = process.env.ISSUE_BODY  || '';
const fullText   = `Title: ${issueTitle}\n\n${issueBody}`;
const apiKey     = process.env.GEMINI_API_KEY;
const today      = new Date().toISOString().split('T')[0];

// Load current data
const news    = JSON.parse(fs.readFileSync('data/news.json',         'utf8'));
const members = JSON.parse(fs.readFileSync('data/members.json',      'utf8'));
const pubs    = JSON.parse(fs.readFileSync('data/publications.json', 'utf8'));

const maxId = arr => Math.max(...arr.map(x => x.id), 0);

const prompt = [
  'You are the AI update bot for the SusMat Lab website at the University of Maine.',
  'Process the update request below and return ONLY a valid JSON object. No markdown, no backticks, no explanation.',
  '',
  `Today: ${today}`,
  `News count: ${news.length}, max id: ${maxId(news)}`,
  `Members count: ${members.length}, max id: ${maxId(members)}`,
  `Publications count: ${pubs.length}, max id: ${maxId(pubs)}`,
  '',
  'Return this exact JSON structure:',
  '{"action":"add|update|delete","target":"news|members|publications","data":{...record...},"summary":"one sentence"}',
  '',
  'news fields: id, date(YYYY-MM-DD), type(publication|award|conference|opening|member|other), title, body, image("")',
  'members fields: id, name, role(Principal Investigator|Postdoctoral Researcher|PhD Student|Masters Student|Undergraduate Researcher|Alumni), title, affiliation, bio, photo(""), email(""), scholar(""), linkedin(""), joined(year)',
  'publications fields: id, year(number), title, authors, journal, doi(""), tags(array)',
  '',
  'For add: omit id (auto-assigned). For update/delete: include existing record id.',
  'Use today as date if not specified. Default affiliation: University of Maine.',
  '',
  'Update request:',
  fullText
].join('\n');

const payload = JSON.stringify({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { maxOutputTokens: 1024, temperature: 0.1 }
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
      catch(e) { reject(new Error('Bad response: ' + body.slice(0, 200))); }
    });
  });
  req.on('error', reject);
  req.write(payload);
  req.end();
});

if (!result.candidates?.[0]) {
  throw new Error('No candidates: ' + JSON.stringify(result).slice(0, 300));
}

const rawText = result.candidates[0].content.parts[0].text.trim();
console.log('Gemini says:', rawText.slice(0, 300));

// Parse JSON robustly
let update;
try {
  const clean = rawText.replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
  update = JSON.parse(clean);
} catch(e) {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (match) update = JSON.parse(match[0]);
  else throw new Error('Cannot parse: ' + rawText.slice(0, 200));
}

console.log('Action:', update.action, '| Target:', update.target);

// Select target
let targetData, targetFile;
if      (update.target === 'news')         { targetData = news;    targetFile = 'data/news.json'; }
else if (update.target === 'members')      { targetData = members; targetFile = 'data/members.json'; }
else if (update.target === 'publications') { targetData = pubs;    targetFile = 'data/publications.json'; }
else throw new Error('Unknown target: ' + update.target);

// Apply action
if (update.action === 'add') {
  update.data.id = maxId(targetData) + 1;
  targetData.push(update.data);
} else if (update.action === 'update') {
  const idx = targetData.findIndex(x => x.id === update.data.id);
  if (idx === -1) throw new Error('ID not found: ' + update.data.id);
  targetData[idx] = { ...targetData[idx], ...update.data };
} else if (update.action === 'delete') {
  const idx = targetData.findIndex(x => x.id === update.data.id);
  if (idx === -1) throw new Error('ID not found: ' + update.data.id);
  targetData.splice(idx, 1);
} else {
  throw new Error('Unknown action: ' + update.action);
}

fs.writeFileSync(targetFile, JSON.stringify(targetData, null, 2));
fs.writeFileSync('update_summary.txt', update.summary || 'Lab website updated.');
console.log('Done:', update.summary);
