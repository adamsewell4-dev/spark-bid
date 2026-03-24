/**
 * src/commercial/estimateGenerator.ts
 *
 * Generates a production budget XLSX estimate from the project brief.
 * Structure mirrors the DSS Template.pdf exactly:
 *   Account A  — Prep Crew
 *   Account B  — Shoot Crew
 *   Account C  — Prep & Wrap Expenses
 *   Account D  — Location Expenses
 *   Account E  — Props, Wardrobe & Animals
 *   Account F  — Studio Costs
 *   Account G  — Art Department Labor
 *   Account H  — Art Department Expenses
 *   Account I  — Equipment Rental
 *   Account J  — Media
 *   Account K  — Miscellaneous Production Costs
 *   Account L  — Director's Fees
 *   Account M  — Talent
 *   Account N  — Talent Expenses
 *   Account O  — Other
 *   Account Q  — Editorial
 *   Account R  — Social Versions
 *   Account S  — Audio
 *   Account T  — Finishing
 *   Account V  — Miscellaneous Editorial
 *   Account W  — Editorial Labor & Creative Fees
 *               Insurance / Production Fee / Grand Total
 *
 * AI suggests Qty values for each line item based on the brief.
 * Estimate column uses =Qty*Rate formulas. All totals are SUM formulas.
 */

import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { CommercialProjectRow } from '../db/index.js';

// ─────────────────────────────────────────────────────────────
// Template data — all line items from the DSS Template.pdf
// ─────────────────────────────────────────────────────────────

interface LineItem {
  num: number;
  name: string;
  unit: string;
  rate: number;
}

interface Section {
  account: string;
  name: string;
  items: LineItem[];
}

const SECTIONS: Section[] = [
  {
    account: 'A', name: 'Prep Crew', items: [
      { num: 1,  name: 'Line Producer',                       unit: 'Day', rate: 900 },
      { num: 2,  name: 'Assistant Director',                  unit: 'Day', rate: 900 },
      { num: 3,  name: 'Director of Photography',             unit: 'Day', rate: 2500 },
      { num: 4,  name: '1st Assistant Camera',                unit: 'Day', rate: 900 },
      { num: 5,  name: '2nd Assistant Camera',                unit: 'Day', rate: 700 },
      { num: 6,  name: 'DIT',                                 unit: 'Day', rate: 1200 },
      { num: 7,  name: 'Prop Master',                         unit: 'Day', rate: 950 },
      { num: 8,  name: 'Asst Props',                          unit: 'Day', rate: 650 },
      { num: 10, name: 'Camera Op',                           unit: 'Day', rate: 1400 },
      { num: 11, name: 'Gaffer',                              unit: 'Day', rate: 900 },
      { num: 12, name: 'Best Boy Electric',                   unit: 'Day', rate: 800 },
      { num: 13, name: '3rd Electric',                        unit: 'Day', rate: 650 },
      { num: 14, name: 'Electric/Driver',                     unit: 'Day', rate: 750 },
      { num: 15, name: 'Prep/Strike/Pre Rig Crew',            unit: 'Day', rate: 800 },
      { num: 16, name: 'Key Grip',                            unit: 'Day', rate: 900 },
      { num: 17, name: 'Best Boy Grip',                       unit: 'Day', rate: 850 },
      { num: 18, name: '3rd Grip',                            unit: 'Day', rate: 650 },
      { num: 19, name: 'Grip/Driver',                         unit: 'Day', rate: 750 },
      { num: 22, name: 'Steadi Cam Op',                       unit: 'Day', rate: 2500 },
      { num: 23, name: 'Choreographer',                       unit: 'Day', rate: 1500 },
      { num: 24, name: 'Make-Up/Hair',                        unit: 'Day', rate: 950 },
      { num: 25, name: 'Make-Up/Hair Asst',                   unit: 'Day', rate: 600 },
      { num: 26, name: 'Wardrobe Stylist',                    unit: 'Day', rate: 950 },
      { num: 27, name: 'Asst Wardrobe',                       unit: 'Day', rate: 650 },
      { num: 29, name: 'Boom Operator',                       unit: 'Day', rate: 750 },
      { num: 30, name: 'Sound Mixer',                         unit: 'Day', rate: 1250 },
      { num: 35, name: 'Storyboard Artist',                   unit: 'Day', rate: 900 },
      { num: 36, name: 'Catering Crew',                       unit: 'Day', rate: 600 },
      { num: 37, name: 'Location Scout',                      unit: 'Day', rate: 650 },
      { num: 40, name: 'Medic',                               unit: 'Day', rate: 850 },
      { num: 41, name: 'Craft Service',                       unit: 'Day', rate: 450 },
      { num: 47, name: 'Production Supervisor',               unit: 'Day', rate: 900 },
      { num: 49, name: 'Production Assistant',                unit: 'Day', rate: 450 },
      { num: 50, name: 'Production Assistant',                unit: 'Day', rate: 450 },
    ],
  },
  {
    account: 'B', name: 'Shoot Crew', items: [
      { num: 51, name: 'Line Producer',                       unit: 'Day', rate: 950 },
      { num: 52, name: 'Assistant Director',                  unit: 'Day', rate: 1000 },
      { num: 53, name: 'Director of Photography',             unit: 'Day', rate: 2500 },
      { num: 54, name: '1st Assistant Camera',                unit: 'Day', rate: 900 },
      { num: 55, name: '2nd Assistant Camera',                unit: 'Day', rate: 700 },
      { num: 56, name: 'DIT',                                 unit: 'Day', rate: 1200 },
      { num: 57, name: 'Prop Master',                         unit: 'Day', rate: 950 },
      { num: 58, name: 'Asst Props',                          unit: 'Day', rate: 650 },
      { num: 60, name: 'Camera Op',                           unit: 'Day', rate: 1400 },
      { num: 61, name: 'Gaffer',                              unit: 'Day', rate: 900 },
      { num: 62, name: 'Best Boy Electric',                   unit: 'Day', rate: 800 },
      { num: 63, name: '3rd Electric',                        unit: 'Day', rate: 650 },
      { num: 64, name: 'Electric/Driver',                     unit: 'Day', rate: 750 },
      { num: 65, name: 'Prep/Strike/Pre Rig Crew',            unit: 'Day', rate: 800 },
      { num: 66, name: 'Key Grip',                            unit: 'Day', rate: 900 },
      { num: 67, name: 'Best Boy Grip',                       unit: 'Day', rate: 850 },
      { num: 68, name: '3rd Grip',                            unit: 'Day', rate: 650 },
      { num: 69, name: 'Grip/Driver',                         unit: 'Day', rate: 750 },
      { num: 72, name: 'Steadi Cam Op',                       unit: 'Day', rate: 2500 },
      { num: 73, name: 'Choreographer',                       unit: 'Day', rate: 1500 },
      { num: 74, name: 'Make-Up/Hair',                        unit: 'Day', rate: 950 },
      { num: 75, name: 'Make-Up/Hair Asst',                   unit: 'Day', rate: 600 },
      { num: 76, name: 'Wardrobe Stylist',                    unit: 'Day', rate: 950 },
      { num: 77, name: 'Asst Wardrobe',                       unit: 'Day', rate: 650 },
      { num: 79, name: 'Boom Operator',                       unit: 'Day', rate: 750 },
      { num: 80, name: 'Sound Mixer',                         unit: 'Day', rate: 1250 },
      { num: 86, name: 'Catering Crew',                       unit: 'Day', rate: 600 },
      { num: 87, name: 'Location Manager',                    unit: 'Day', rate: 650 },
      { num: 90, name: 'Medic',                               unit: 'Day', rate: 850 },
      { num: 91, name: 'Craft Service',                       unit: 'Day', rate: 450 },
      { num: 97, name: 'Production Supervisor',               unit: 'Day', rate: 1200 },
      { num: 98, name: 'Asst Production Supervisor',          unit: 'Day', rate: 900 },
      { num: 99, name: 'Production Assistant',                unit: 'Day', rate: 450 },
      { num: 100, name: 'Production Assistant',               unit: 'Day', rate: 450 },
    ],
  },
  {
    account: 'C', name: 'Prep & Wrap Expenses', items: [
      { num: 101, name: 'Craft Service',                      unit: 'Day',   rate: 300 },
      { num: 102, name: 'Per Diems',                          unit: 'Each',  rate: 85 },
      { num: 103, name: 'Hotels',                             unit: 'Night', rate: 325 },
      { num: 104, name: 'Scouting Expenses',                  unit: 'Each',  rate: 250 },
      { num: 105, name: 'Deliveries & Taxi',                  unit: 'Allow', rate: 200 },
      { num: 106, name: 'Car Rental',                         unit: 'Day',   rate: 250 },
      { num: 107, name: 'Trucking',                           unit: 'Each',  rate: 650 },
      { num: 108, name: 'Casting Director',                   unit: 'Day',   rate: 1200 },
      { num: 109, name: 'Casting Facility',                   unit: 'Day',   rate: 900 },
      { num: 112, name: 'Working Meals',                      unit: 'Each',  rate: 35 },
    ],
  },
  {
    account: 'D', name: 'Location Expenses', items: [
      { num: 114, name: 'Location Fees',                      unit: 'Each',  rate: 1500 },
      { num: 115, name: 'Permits',                            unit: 'Each',  rate: 600 },
      { num: 117, name: 'Set Security',                       unit: 'Each',  rate: 450 },
      { num: 118, name: 'Cargo Van',                          unit: 'Each',  rate: 175 },
      { num: 119, name: 'Production Trucking',                unit: 'Each',  rate: 850 },
      { num: 120, name: 'Camera Truck',                       unit: 'Each',  rate: 950 },
      { num: 121, name: 'Car Rentals',                        unit: 'Each',  rate: 125 },
      { num: 127, name: 'Parking/Tolls/Gas',                  unit: 'Each',  rate: 300 },
      { num: 129, name: 'Air Fares',                          unit: 'Each',  rate: 600 },
      { num: 130, name: 'Hotels',                             unit: 'Each',  rate: 325 },
      { num: 131, name: 'Per Diems',                          unit: 'Each',  rate: 85 },
      { num: 132, name: 'Talent Meals',                       unit: 'Each',  rate: 75 },
      { num: 133, name: 'Breakfast',                          unit: 'Person', rate: 20 },
      { num: 134, name: 'Lunch',                              unit: 'Person', rate: 30 },
      { num: 135, name: 'Dinner',                             unit: 'Person', rate: 45 },
      { num: 136, name: 'Cabs/Ubers/Lyfts/Other Transport',  unit: 'Each',  rate: 75 },
    ],
  },
  {
    account: 'E', name: 'Props, Wardrobe & Animals', items: [
      { num: 140, name: 'Prop Rental',                        unit: 'Each', rate: 500 },
      { num: 141, name: 'Prop Purchase',                      unit: 'Each', rate: 750 },
      { num: 143, name: 'Wardrobe Rental',                    unit: 'Each', rate: 500 },
      { num: 144, name: 'Wardrobe Purchase',                  unit: 'Each', rate: 800 },
      { num: 145, name: 'Costumes',                           unit: 'Each', rate: 1200 },
      { num: 148, name: 'Theatrical Makeup',                  unit: 'Each', rate: 400 },
      { num: 149, name: 'Product Prep / Color Correct',       unit: 'Each', rate: 500 },
      { num: 150, name: 'Greens',                             unit: 'Each', rate: 500 },
    ],
  },
  {
    account: 'F', name: 'Studio Costs', items: [
      { num: 151, name: 'Rental For Build Days',              unit: 'Day',  rate: 2500 },
      { num: 153, name: 'Rental for Pre-Lite Days',           unit: 'Day',  rate: 2500 },
      { num: 155, name: 'Rental for Shoot Days',              unit: 'Day',  rate: 3000 },
      { num: 157, name: 'Rental for Strike Days',             unit: 'Day',  rate: 2500 },
      { num: 159, name: 'Generator and Operator',             unit: 'Day',  rate: 900 },
      { num: 160, name: 'Stage Manager/Studio Security',      unit: 'Day',  rate: 650 },
      { num: 161, name: 'Power Charges',                      unit: 'Day',  rate: 250 },
      { num: 162, name: 'Misc Studio Charges',                unit: 'Day',  rate: 250 },
      { num: 163, name: 'Meals for Crew & Talent',            unit: 'Day',  rate: 45 },
      { num: 165, name: 'Crew Parking',                       unit: 'Day',  rate: 150 },
    ],
  },
  {
    account: 'G', name: 'Art Department Labor', items: [
      { num: 168, name: 'Production Designer/Art Director',   unit: 'Day', rate: 1800 },
      { num: 170, name: 'Set Decorator',                      unit: 'Day', rate: 1200 },
      { num: 171, name: 'Art Dept Coordinator',               unit: 'Day', rate: 850 },
      { num: 172, name: 'Prop Master',                        unit: 'Day', rate: 950 },
      { num: 173, name: 'Asst Props',                         unit: 'Day', rate: 650 },
      { num: 176, name: 'Set Dresser',                        unit: 'Day', rate: 650 },
    ],
  },
  {
    account: 'H', name: 'Art Department Expenses', items: [
      { num: 181, name: 'Set Dressing Rentals',               unit: 'Each', rate: 750 },
      { num: 182, name: 'Set Dressing Purchases',             unit: 'Each', rate: 1200 },
      { num: 183, name: 'Art Dept Prod Supplies',             unit: 'Each', rate: 400 },
      { num: 185, name: 'Special Effects Rental',             unit: 'Each', rate: 1500 },
      { num: 186, name: 'Art Dept Trucking',                  unit: 'Each', rate: 650 },
      { num: 189, name: 'Art Dept Meals',                     unit: 'Each', rate: 35 },
    ],
  },
  {
    account: 'I', name: 'Equipment Rental', items: [
      { num: 193, name: 'Camera Rental',                      unit: 'Day', rate: 2500 },
      { num: 194, name: 'Sound Rental',                       unit: 'Day', rate: 900 },
      { num: 195, name: 'Lighting Rental',                    unit: 'Day', rate: 3500 },
      { num: 196, name: 'Grip Rental',                        unit: 'Day', rate: 3000 },
      { num: 197, name: 'Generator Rental',                   unit: 'Day', rate: 750 },
      { num: 199, name: 'VTR Rental',                         unit: 'Day', rate: 650 },
      { num: 200, name: 'Walkie Talkie Rental',               unit: 'Day', rate: 200 },
      { num: 201, name: 'Dolly Rental',                       unit: 'Day', rate: 450 },
      { num: 202, name: 'SteadiCam',                          unit: 'Day', rate: 2500 },
      { num: 204, name: 'Production Supplies',                unit: 'Day', rate: 250 },
      { num: 205, name: 'Jib Arm',                            unit: 'Day', rate: 650 },
      { num: 208, name: 'Expendables',                        unit: 'Day', rate: 350 },
      { num: 209, name: 'Lenses',                             unit: 'Day', rate: 1500 },
    ],
  },
  {
    account: 'J', name: 'Media', items: [
      { num: 211, name: 'Media / Drives',                     unit: 'Each', rate: 250 },
      { num: 213, name: 'Transcode / Transfer',               unit: 'Hour', rate: 175 },
      { num: 215, name: 'Dailies',                            unit: 'Each', rate: 500 },
    ],
  },
  {
    account: 'K', name: 'Miscellaneous Production Costs', items: [
      { num: 217, name: 'Petty Cash',                         unit: 'Each', rate: 500 },
      { num: 219, name: 'Phones and Cables',                  unit: 'Each', rate: 75 },
      { num: 220, name: 'Cash Under $15 Each',                unit: 'Each', rate: 200 },
      { num: 221, name: 'External Billing Costs',             unit: 'Each', rate: 150 },
      { num: 223, name: 'Cell Phones',                        unit: 'Each', rate: 50 },
    ],
  },
  {
    account: 'L', name: "Director's Fees", items: [
      { num: 227, name: 'Director Prep',                      unit: 'Day', rate: 2500 },
      { num: 228, name: 'Director Travel',                    unit: 'Day', rate: 1500 },
      { num: 229, name: 'Director Shoot',                     unit: 'Day', rate: 5000 },
      { num: 230, name: 'Director Post',                      unit: 'Day', rate: 2500 },
    ],
  },
  {
    account: 'M', name: 'Talent', items: [
      { num: 234, name: 'O/C Principal #1',                   unit: 'Day', rate: 3500 },
      { num: 235, name: 'O/C Principal #2',                   unit: 'Day', rate: 3500 },
      { num: 236, name: 'O/C Principal #3',                   unit: 'Day', rate: 3500 },
      { num: 237, name: 'O/C Principal #4',                   unit: 'Day', rate: 3500 },
      { num: 244, name: 'Office Extras',                      unit: 'Day', rate: 450 },
      { num: 246, name: 'Crowd Extras',                       unit: 'Day', rate: 350 },
      { num: 247, name: 'General Extras',                     unit: 'Day', rate: 350 },
      { num: 255, name: 'Hand Models',                        unit: 'Day', rate: 2000 },
      { num: 258, name: 'Voice Over',                         unit: 'Day', rate: 2000 },
      { num: 259, name: 'Fitting Fees',                       unit: 'Day', rate: 250 },
      { num: 263, name: 'Audition Fees',                      unit: 'Day', rate: 200 },
      { num: 268, name: 'Talent Wardrobe Allowance',          unit: 'Day', rate: 150 },
    ],
  },
  {
    account: 'N', name: 'Talent Expenses', items: [
      { num: 271, name: 'Talent Air Fares',                   unit: 'Each', rate: 600 },
      { num: 272, name: 'Talent Per Diem',                    unit: 'Each', rate: 100 },
      { num: 273, name: 'Talent Ground Transportation',       unit: 'Each', rate: 125 },
    ],
  },
  {
    account: 'O', name: 'Other', items: [],
  },
  {
    account: 'Q', name: 'Editorial', items: [
      { num: 2010, name: 'File Conversion & Transcoding',     unit: 'Hour',  rate: 175 },
      { num: 2110, name: 'Offline Edit System',               unit: 'Day',   rate: 750 },
      { num: 2120, name: 'Off-Line Graphics System',          unit: 'Day',   rate: 650 },
      { num: 2140, name: 'Conform',                           unit: 'Hour',  rate: 225 },
      { num: 2220, name: 'Color Prep',                        unit: 'Flat',  rate: 500 },
      { num: 2240, name: 'Graphics Prep',                     unit: 'Flat',  rate: 600 },
      { num: 2310, name: 'Remote Off-Line Edit Suite',        unit: 'Day',   rate: 900 },
      { num: 2350, name: 'Archiving',                         unit: 'Flat',  rate: 300 },
    ],
  },
  {
    account: 'R', name: 'Social Versions', items: [
      { num: 3010, name: 'Additional Cleanup',                unit: 'Hour', rate: 200 },
      { num: 3020, name: 'Re-position / Re-composite',        unit: 'Hour', rate: 225 },
      { num: 3050, name: 'Pre-Roll Versions',                 unit: 'Flat', rate: 250 },
      { num: 3110, name: 'Additional Grading',                unit: 'Hour', rate: 250 },
      { num: 3120, name: 'File Versioning / Compression',     unit: 'Hour', rate: 175 },
      { num: 3130, name: 'Reformatting 1x1',                  unit: 'Hour', rate: 150 },
      { num: 3140, name: 'Reformatting 9x16',                 unit: 'Hour', rate: 175 },
      { num: 3420, name: 'Postings / Digital Delivery / QC',  unit: 'Allow', rate: 350 },
    ],
  },
  {
    account: 'S', name: 'Audio', items: [
      { num: 4020, name: 'Sound Effects / Music Search',      unit: 'Hour',  rate: 225 },
      { num: 4110, name: 'VO Record',                         unit: 'Hour',  rate: 300 },
      { num: 4130, name: '5.1 Mix',                           unit: 'Hour',  rate: 400 },
      { num: 4150, name: 'Record and Mix',                    unit: 'Hour',  rate: 350 },
      { num: 4210, name: 'Music Licensing (Stock/Original)',  unit: 'Allow', rate: 0 },
      { num: 4230, name: 'Sound Design',                      unit: 'Allow', rate: 750 },
      { num: 4360, name: 'Field Recording',                   unit: 'Day',   rate: 1200 },
    ],
  },
  {
    account: 'T', name: 'Finishing', items: [
      { num: 5010, name: 'Color Grading Prep',                unit: 'Hour', rate: 250 },
      { num: 5020, name: 'Color Grading',                     unit: 'Hour', rate: 350 },
      { num: 5110, name: 'Final Conform',                     unit: 'Hour', rate: 300 },
      { num: 5120, name: 'Compositing / VFX',                 unit: 'Each', rate: 450 },
      { num: 5140, name: '2D GFX / Design',                   unit: 'Each', rate: 350 },
      { num: 5150, name: 'Motion Graphics',                   unit: 'Hour', rate: 300 },
      { num: 5160, name: 'Color Correction',                  unit: 'Hour', rate: 300 },
      { num: 5170, name: '3D Animation',                      unit: 'Each', rate: 750 },
      { num: 5230, name: 'Retouching',                        unit: 'Each', rate: 250 },
      { num: 5340, name: 'Master',                            unit: 'Each', rate: 250 },
      { num: 5350, name: 'Deliverables',                      unit: 'Each', rate: 200 },
    ],
  },
  {
    account: 'V', name: 'Miscellaneous Editorial', items: [
      { num: 7010, name: 'Storage Devices',                   unit: 'Each',  rate: 250 },
      { num: 7020, name: 'Archiving/LTO',                     unit: 'Allow', rate: 450 },
      { num: 7050, name: 'Standards Conversion',              unit: 'Hour',  rate: 200 },
      { num: 7110, name: 'Deliveries & Messengers',           unit: 'Each',  rate: 100 },
      { num: 7310, name: 'Editorial Supplies',                unit: 'Allow', rate: 150 },
      { num: 7320, name: 'Equipment Rental',                  unit: 'Allow', rate: 250 },
      { num: 7330, name: 'Working Meals',                     unit: 'Allow', rate: 35 },
    ],
  },
  {
    account: 'W', name: 'Editorial Labor & Creative Fees', items: [
      { num: 8010, name: 'Pre-Production Labor',              unit: 'Day',  rate: 950 },
      { num: 8020, name: 'Editor Labor',                      unit: 'Day',  rate: 1400 },
      { num: 8030, name: 'Editor OT/Weekend',                 unit: 'Day',  rate: 1750 },
      { num: 8040, name: 'Assistant Labor',                   unit: 'Day',  rate: 900 },
      { num: 8060, name: 'Session Supervisory Fee',           unit: 'Day',  rate: 900 },
      { num: 8070, name: 'Producer / Coordinator',            unit: 'Day',  rate: 950 },
      { num: 8100, name: 'Creative Fees',                     unit: 'Flat', rate: 2500 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// AI suggestion types
// ─────────────────────────────────────────────────────────────

interface LineItemSuggestion {
  account: string;
  num: number;
  qty: number;
}

// ─────────────────────────────────────────────────────────────
// AI suggestion generator
// ─────────────────────────────────────────────────────────────

async function suggestLineItems(project: CommercialProjectRow): Promise<LineItemSuggestion[]> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const deliverables: string[] = project.deliverables
    ? (JSON.parse(project.deliverables) as string[])
    : [];

  // Build a compact list of all line items for Claude to reference
  const lineItemList = SECTIONS.flatMap((s) =>
    s.items.map((item) => `${s.account}${item.num}: ${item.name} (${item.unit}, $${item.rate})`)
  ).join('\n');

  const prompt = `You are a production budget estimator for Digital Spark Studios. Based on the project brief below, suggest quantities for the relevant line items from the budget template.

PROJECT BRIEF:
Client: ${project.client_name}
Project Type: ${project.project_type ?? 'Not specified'}
Deliverables: ${deliverables.length > 0 ? deliverables.join(', ') : 'Not specified'}
Discovery Notes: ${project.discovery_notes ?? 'None'}
Budget Signal: ${project.budget_signal ?? 'Not discussed'}
Tone: ${project.tone ?? 'Not specified'}

BUDGET LINE ITEMS (Account+Number: Name, Unit, Rate):
${lineItemList}

Return ONLY a JSON array of suggested line items with non-zero quantities. Format:
[{"account":"B","num":53,"qty":2},{"account":"B","num":61,"qty":2},...]

Rules:
- Only include line items that are actually needed for this project
- Qty should reflect realistic days/units for the scope described
- For photography-only projects, skip Director's Fees (L) and most audio (S)
- For studio shoots, populate Section F (Studio Costs)
- For location shoots, populate Section D (Location Expenses) instead
- Always include at least some post-production (Q, T, W)
- Base quantities on the number of shoot days implied by deliverables and notes
- Return valid JSON only, no explanation`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '[]';

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]) as LineItemSuggestion[];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// XLSX builder
// ─────────────────────────────────────────────────────────────

export async function generateEstimateXlsx(project: CommercialProjectRow): Promise<Buffer> {
  const suggestions = await suggestLineItems(project);

  // Build lookup: "A1" -> qty
  const qtyMap = new Map<string, number>();
  for (const s of suggestions) {
    qtyMap.set(`${s.account}${s.num}`, s.qty);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Digital Spark Studios / Spark Bid';
  workbook.created = new Date();

  // ── Color palette ──────────────────────────────────────────
  const COLOR_HEADER_BG = '1e1b4b';
  const COLOR_SECTION_BG = 'e8e4ff';
  const COLOR_TOTAL_BG   = 'd1cdf7';
  const COLOR_WHITE      = 'FFFFFF';
  const COLOR_LIGHT_GRAY = 'f5f5f5';

  // ── Summary Sheet ──────────────────────────────────────────
  const summary = workbook.addWorksheet('Cost Summary');
  summary.columns = [
    { key: 'account', width: 12 },
    { key: 'name',    width: 40 },
    { key: 'estimate', width: 18 },
  ];

  const addSummaryTitle = (text: string) => {
    const row = summary.addRow([text]);
    row.getCell(1).font = { bold: true, size: 16, color: { argb: COLOR_HEADER_BG } };
    row.height = 24;
    summary.mergeCells(`A${row.number}:C${row.number}`);
  };

  const addSummarySubtitle = (text: string) => {
    const row = summary.addRow([text]);
    row.getCell(1).font = { bold: true, size: 12 };
    summary.mergeCells(`A${row.number}:C${row.number}`);
  };

  addSummaryTitle('Digital Spark Studios');
  addSummarySubtitle('Production Budget Estimate');
  summary.addRow([]);

  // Production company info
  const infoRows = [
    ['Production Company:', 'Digital Spark Studios'],
    ['Address:', '9525 Monroe Rd, Ste 150, Charlotte, NC 28270'],
    ['Phone:', '+1 (980) 216-8624'],
    ['Executive Producer:', 'Adam Sewell'],
    ['Director:', 'Joshua Hieber'],
    ['Client:', project.client_name],
    ['Project:', project.project_type?.replace(/_/g, ' ') ?? ''],
    ['Date:', new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
  ];
  for (const [label, value] of infoRows) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.addRow([]);

  // Column headers
  const headerRow = summary.addRow(['Account', 'Name', 'Estimate']);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.font = { bold: true, color: { argb: COLOR_WHITE } };
    cell.alignment = { horizontal: 'center' };
  });

  // Track rows for cross-sheet references
  const sectionTotalRefs: string[] = [];

  for (const section of SECTIONS) {
    const row = summary.addRow([section.account, section.name, 0]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = '#,##0.00';
    // We'll update with cross-sheet reference after detail sheet is built
    sectionTotalRefs.push(`C${row.number}`);
    if (summary.rowCount % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_LIGHT_GRAY } };
      });
    }
  }

  summary.addRow([]);
  const subtotalRow = summary.addRow(['', 'Sub-Total A to K', { formula: `SUM(C${sectionTotalRefs[0]}:C${sectionTotalRefs[10]})` }]);
  subtotalRow.getCell(2).font = { bold: true };
  subtotalRow.getCell(3).numFmt = '#,##0.00';
  subtotalRow.getCell(3).font = { bold: true };
  subtotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } };
  });

  summary.addRow([]);
  const insuranceRow  = summary.addRow(['', 'Insurance',      0]);
  insuranceRow.getCell(3).numFmt = '#,##0.00';
  const prodFeeRow    = summary.addRow(['', 'Production Fee', 0]);
  prodFeeRow.getCell(3).numFmt = '#,##0.00';

  summary.addRow([]);
  const grandTotalRow = summary.addRow(['', 'GRAND TOTAL', {
    formula: `SUM(${sectionTotalRefs.join(',')},C${insuranceRow.number},C${prodFeeRow.number})`,
  }]);
  grandTotalRow.getCell(2).font = { bold: true, size: 12, color: { argb: COLOR_HEADER_BG } };
  grandTotalRow.getCell(3).font = { bold: true, size: 12, color: { argb: COLOR_HEADER_BG } };
  grandTotalRow.getCell(3).numFmt = '#,##0.00';
  grandTotalRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION_BG } };
  });

  // ── Detail Sheet ───────────────────────────────────────────
  const detail = workbook.addWorksheet('Estimate Detail');
  detail.columns = [
    { key: 'account', width: 10 },
    { key: 'num',     width: 8 },
    { key: 'name',    width: 42 },
    { key: 'qty',     width: 8 },
    { key: 'unit',    width: 10 },
    { key: 'rate',    width: 14 },
    { key: 'estimate', width: 16 },
  ];

  // Header row
  const detailHeader = detail.addRow(['Account', 'No.', 'Name', 'Qty', 'Unit', 'Rate', 'Estimate']);
  detailHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.font = { bold: true, color: { argb: COLOR_WHITE } };
    cell.alignment = { horizontal: 'center' };
  });

  let summaryRowIdx = 0;

  for (const section of SECTIONS) {
    // Section header row
    const sectionRow = detail.addRow([section.account, '', section.name, '', '', '', 0]);
    sectionRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_SECTION_BG } };
      cell.font = { bold: true };
    });
    sectionRow.getCell(1).alignment = { horizontal: 'center' };
    sectionRow.getCell(7).numFmt = '#,##0.00';

    const itemRows: number[] = [];

    for (const item of section.items) {
      const key = `${section.account}${item.num}`;
      const qty = qtyMap.get(key) ?? 0;
      const rowNum = detail.rowCount + 1;
      const row = detail.addRow([
        section.account,
        item.num,
        item.name,
        qty,
        item.unit,
        item.rate,
        qty > 0 ? { formula: `D${rowNum}*F${rowNum}` } : 0,
      ]);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
      if (qty > 0) {
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff9c4' } };
        row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fff9c4' } };
      }
      itemRows.push(rowNum);
    }

    // Section total (sum of estimate column for this section)
    const totalRowNum = detail.rowCount + 1;
    let totalFormula: ExcelJS.CellFormulaValue | number = 0;
    if (itemRows.length > 0) {
      totalFormula = { formula: `SUM(G${itemRows[0]}:G${itemRows[itemRows.length - 1]})` };
    }
    const totalRow = detail.addRow(['', '', `${section.name} Total`, '', '', '', totalFormula]);
    totalRow.getCell(3).font = { bold: true };
    totalRow.getCell(7).font = { bold: true };
    totalRow.getCell(7).numFmt = '#,##0.00';
    totalRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTAL_BG } };
    });

    // Update the summary sheet reference to point to this total cell
    const summaryRef = sectionTotalRefs[summaryRowIdx];
    if (summaryRef) {
      const summaryRowNum = parseInt(summaryRef.replace('C', ''), 10);
      const summaryRow = summary.getRow(summaryRowNum);
      summaryRow.getCell(3).value = { formula: `'Estimate Detail'!G${totalRowNum}` };
    }

    // Update section header to show total
    sectionRow.getCell(7).value = { formula: `G${totalRowNum}` };

    detail.addRow([]); // spacer
    summaryRowIdx++;
  }

  return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
}
