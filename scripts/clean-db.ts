/**
 * Wipes opportunities and requirements tables, then exits.
 * Run before a fresh monitor scan to clear false positives.
 */
import { db } from '../src/db/index.js';

const opps = db.prepare('DELETE FROM opportunities').run();
const reqs = db.prepare('DELETE FROM requirements').run();
const props = db.prepare('DELETE FROM proposals').run();

console.log(`Deleted ${opps.changes} opportunities`);
console.log(`Deleted ${reqs.changes} requirements`);
console.log(`Deleted ${props.changes} proposals`);
console.log('Database cleared. Run: npm run monitor');
