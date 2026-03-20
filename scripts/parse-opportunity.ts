import { listOpportunities, getOpportunity } from '../src/db/index.js';
import { parseOpportunity } from '../src/parser/index.js';

// Pass an ID as argument: npx tsx scripts/parse-opportunity.ts <id>
// Otherwise picks the first opportunity with attachments
const targetId = process.argv[2];

const opps = listOpportunities();
if (opps.length === 0) {
  console.log('No opportunities in database. Run npm run monitor first.');
  process.exit(1);
}

const opp = targetId
  ? (getOpportunity(targetId) ?? opps[0])
  : (opps.find(o => o.attachments_json !== null) ?? opps[0]);
console.log(`\nParsing: ${opp.title}`);
console.log(`Agency:  ${opp.agency ?? 'N/A'}`);
console.log(`ID:      ${opp.id}\n`);

const result = await parseOpportunity(opp.id);

console.log('\n── Results ──────────────────────────────');
console.log(`Files processed: ${result.filesProcessed}`);
console.log(`Total text:      ${result.totalText.length} characters`);
console.log(`Requirements:    ${result.requirements.length} extracted`);
console.log(`Errors:          ${result.errors.length}`);

if (result.requirements.length > 0) {
  console.log('\n── Requirements ─────────────────────────');
  for (const req of result.requirements) {
    console.log(`[${req.category.toUpperCase()}] ${req.text}`);
  }
}

if (result.errors.length > 0) {
  console.log('\n── Errors ───────────────────────────────');
  result.errors.forEach(e => console.log(' •', e));
}
