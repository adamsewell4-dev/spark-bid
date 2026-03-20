import { listOpportunities } from '../src/db/index.js';

const opps = listOpportunities();
if (opps.length === 0) {
  console.log('No opportunities in database yet.');
} else {
  opps.forEach(o => {
    console.log(`\nTitle:    ${o.title}`);
    console.log(`Agency:   ${o.agency ?? 'N/A'}`);
    console.log(`Deadline: ${o.response_deadline ?? 'N/A'}`);
    console.log(`URL:      ${o.url ?? 'N/A'}`);
  });
}
