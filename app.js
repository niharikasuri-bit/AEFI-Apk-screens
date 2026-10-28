/* AEFI – Adverse Event Following Immunization (mobile prototype)
 *
 * Home → Report AEFI → AEFI Cases Overview → Child Details → AEFI Case Details
 *      → AEFI Form and Kit Details → Summary → AEFI Case Reported
 * Home → Manage Stock → Record AEFI Forms and Kits → AEFI Forms and Kits Recorded
 * Home → Manage Stock → Receipt | Issued | Returned | Discrepancy
 *      — the same flows as the inventory app (github.com/niharikasuri-bit/inventory),
 *        with AEFI forms and AEFI kits (adrenaline) as resources next to the polio vaccine.
 *
 * The polio Outside Household screens below are kept from the polio-app copy.
 *
 * Flow: Select Vaccination Location → Search (Transit Post | Outside Household Place)
 *       → [Setup if not found] → Overview → Child Details
 *       → Vaccination Checklist → Vaccination Successful
 *
 * Transit Post and Outside Household Place share every screen; KINDS holds the wording that differs.
 * Titles use the full name; CTAs (cta) and inputs (field) shorten "household" to "HH".
 * Recents, created locations and today's counts persist in localStorage so a
 * second visit behaves like a returning user.
 */
(function () {
  "use strict";

  // ---------- Config ----------
  const KINDS = {
    tp: {
      short: "Transit Post",
      cta: "Transit Post",
      lower: "transit post",
      field: "transit post",
      described: "transit post",
      nameLabel: "Transit post name",
      areaLabel: "Transit post area",
      typeLabel: "Transit post type",
      optionSub: "Transit locations such as bus stations and border points.",
      types: ["Bus stand", "Railway station", "Market", "Border crossing", "Toll plaza", "Ferry terminal"]
    },
    clf: {
      short: "Outside Household Place",
      cta: "Outside HH Place",
      lower: "outside household place",
      field: "outside HH place",
      described: "outside household place",
      nameLabel: "Outside HH place name",
      areaLabel: "Outside HH place area",
      typeLabel: "Outside HH place type",
      optionSub: "Shared sites such as schools, markets and health posts.",
      types: ["Orphanage", "Boarding school", "Religious school", "Hostel", "Displacement camp"]
    }
  };

  const LOCALITIES = ["Central Ward", "North Ward", "East Ward", "Riverside", "Old Town", "Market Area"];
  const ASSIGNED_AREA = "Central Ward";

  // Mock master data — stands in for the boundary/facility service.
  const SEED = {
    tp: [
      { id: "tp-1", name: "Central Bus Station", type: "Bus stand", locality: "Central Ward", km: 0.4 },
      { id: "tp-2", name: "City Railway Station Gate 2", type: "Railway station", locality: "Central Ward", km: 0.9 },
      { id: "tp-3", name: "Riverside Market Entrance", type: "Market", locality: "Riverside", km: 1.6 },
      { id: "tp-4", name: "Old Town Bus Stop", type: "Bus stand", locality: "Old Town", km: 2.3 },
      { id: "tp-5", name: "North Highway Toll Plaza", type: "Toll plaza", locality: "North Ward", km: 3.8 },
      { id: "tp-6", name: "East Ferry Terminal", type: "Ferry terminal", locality: "East Ward", km: 4.6 },
      { id: "tp-7", name: "District Border Checkpost", type: "Border crossing", locality: "North Ward", km: 11.2 }
    ],
    clf: [
      { id: "clf-1", name: "Hope Children's Home", type: "Orphanage", locality: "Central Ward", km: 0.7 },
      { id: "clf-2", name: "St. Mary's Boarding School", type: "Boarding school", locality: "Old Town", km: 1.4 },
      { id: "clf-3", name: "Riverside Learning Centre", type: "Religious school", locality: "Riverside", km: 2.1 },
      { id: "clf-4", name: "Government Girls' Hostel", type: "Hostel", locality: "East Ward", km: 3.2 },
      { id: "clf-5", name: "North Relief Camp", type: "Displacement camp", locality: "North Ward", km: 4.9 },
      { id: "clf-6", name: "Hilltop Residential School", type: "Boarding school", locality: "North Ward", km: 8.5 }
    ]
  };

  // Vaccines offered for "Vaccine administered" — placeholder list until the real one is supplied.
  // Record AEFI Forms and Kits — the four indicators. A Yes opens a quantity.
  // "Used" depends on "available": it is only asked once the item is available.
  const STOCK_QUESTIONS = [
    { id: "stk-form-available", key: "formAvailable", label: "Are AEFI forms available?", qty: "How many AEFI forms are available?" },
    { id: "stk-form-used", key: "formUsed", label: "Have AEFI forms been used for reporting AEFI cases?", qty: "How many AEFI forms have been used?", dependsOn: "formAvailable" },
    { id: "stk-kit-available", key: "kitAvailable", label: "Are AEFI kits (adrenaline) available?", qty: "How many AEFI kits (adrenaline) are available?" },
    { id: "stk-kit-used", key: "kitUsed", label: "Have AEFI kits (adrenaline) been used for managing AEFI cases?", qty: "How many AEFI kits (adrenaline) have been used?", dependsOn: "kitAvailable" }
  ];
  const askedStock = (q, s) => !q.dependsOn || s[q.dependsOn] === "Yes";
  const freshStock = () => Object.fromEntries(STOCK_QUESTIONS.flatMap(q => [[q.key, ""], [`${q.key}Qty`, ""]]));
  const isWholeAtLeastOne = v => /^\d+$/.test(v.trim()) && Number(v) > 0;

  // ---------- Manage Stock ----------
  // AEFI forms and kits move through the stock flows like any other resource.
  const STOCK_RESOURCES = [
    { name: "Polio vaccine (OPV)", unit: "vials", available: 500 },
    { name: "AEFI forms", unit: "forms", available: 100 },
    { name: "AEFI kits (adrenaline)", unit: "kits", available: 10 }
  ];
  const resIndex = name => STOCK_RESOURCES.findIndex(r => r.name === name);
  const resUnit = name => STOCK_RESOURCES[resIndex(name)].unit;
  const CURRENT_FACILITY = "Central Ward Health Facility";
  const FACILITIES = ["District Vaccine Store", "North Ward Health Post", "Riverside Health Post", "Old Town Health Post"];
  const TRANSPORT_TYPES = ["Truck", "Van", "Motorcycle", "Cycle", "Boat", "Other"];
  // Report Stock Discrepancy asks what caused it (the separate Damaged record was dropped).
  // "Other" opens a required box to specify the reason.
  const DISCREPANCY_REASONS = ["Damage in transit", "Damage in storage", "Other"];
  const otherField = (id, value, show) => `<div class="secondary-container dependent" id="${id}-wrap" ${show ? "" : "hidden"}>
      ${textField({ id, label: "Specify the reason", value, required: true })}
    </div>`;
  // Stock sent to this facility — received in Stock Receipt, reported against in Discrepancy.
  const STOCK_TXNS = [
    { id: "TXN-6486482", from: "District Vaccine Store", date: "25 Oct 2026", time: "10:45",
      items: { "Polio vaccine (OPV)": 120, "AEFI forms": 50, "AEFI kits (adrenaline)": 5 } },
    { id: "TXN-6486510", from: "District Vaccine Store", date: "24 Oct 2026", time: "16:20",
      items: { "Polio vaccine (OPV)": 80, "AEFI forms": 20 } },
    { id: "TXN-6486233", from: "North Ward Health Post", date: "20 Oct 2026", time: "08:05",
      items: { "AEFI kits (adrenaline)": 4 } }
  ];
  // Stock Receipt list, as in the inventory app: each resource carries its own status.
  const freshReceipts = () => [
    ...STOCK_TXNS.map(t => ({ id: t.id, from: t.from, date: t.date, time: t.time, status: "pending",
      resources: Object.entries(t.items).map(([name, quantity]) => ({ name, quantity, status: "pending" })) })),
    { id: "TXN-6485901", from: "District Vaccine Store", date: "18 Oct 2026", time: "14:32", status: "confirmed",
      resources: [{ name: "Polio vaccine (OPV)", quantity: 200, received: 200, status: "confirmed" },
                  { name: "AEFI forms", quantity: 40, received: 40, status: "confirmed" }] },
    { id: "TXN-6485770", from: "North Ward Health Post", date: "15 Oct 2026", time: "09:15", status: "discrepancy",
      resources: [{ name: "Polio vaccine (OPV)", quantity: 100, received: 95, status: "discrepancy", reason: "Damage in transit" },
                  { name: "AEFI kits (adrenaline)", quantity: 6, received: 6, status: "confirmed" }] }
  ];
  // Pending while any resource is unprocessed; otherwise Discrepancy if any resource has one, else Confirmed.
  const deriveStatus = rs => rs.some(r => r.status === "pending") ? "pending" : rs.some(r => r.status === "discrepancy") ? "discrepancy" : "confirmed";
  const SORT_OPTIONS = [["newest", "Date — Newest First"], ["oldest", "Date — Oldest First"], ["facility", "Facility Name (A–Z)"]];
  const freshRc = () => ({ txns: freshReceipts(), tab: "pending", search: "", sort: "newest", draft: "newest", sortOpen: false,
    txnId: null, resIdx: null, wasPending: false, scans: 0, scanned: false, mismatch: false, rcv: "", reason: "", other: "", comment: "", qr: false });
  const rcTxn = () => state.rc.txns.find(t => t.id === state.rc.txnId);
  const rcRes = () => rcTxn().resources[state.rc.resIdx];

  // Copy follows the inventory app's Manage Stock cards, screens and success messages.
  const STOCK_FLOWS = {
    receipt: { icon: "receipt", card: "Record Stock Receipt", sub: "Record stock received at the warehouse and confirm the resources received.",
      start: "receiptList",
      success: "Stock Received Successfully", successDesc: "The stock receipt has been recorded successfully. The received resources are now added to the warehouse stock.", again: "Record Another Receipt" },
    issue: { icon: "issue", card: "Record Stock Issued", sub: "Create a record stock issued from the warehouse to another facility, warehouse, or user.",
      start: "stockForm", formTitle: "Record Stock Issue", fromLabel: "Issued from", toLabel: "Issued to", qtyLabel: "Quantity to issue",
      success: "Stock Issued Successfully", successDesc: "The stock issue has been recorded successfully. The issued resources have been deducted from the warehouse stock.", again: "Issue More Stock" },
    return: { icon: "returned", card: "Record Stock Returned", sub: "Record stock items returned from field teams or distribution points.",
      start: "stockForm", formTitle: "Record Stock Return", fromLabel: "Returned from", toLabel: "Returned to", qtyLabel: "Quantity to return",
      success: "Return Recorded Successfully", successDesc: "The stock return has been recorded successfully. The returned resources have been added to the warehouse stock.", again: "Record Another Return" },
    discrepancy: { icon: "discrepancy", card: "Report Stock Discrepancy", sub: "Report a discrepancy between expected and received stock quantities.",
      start: "stockTxns", txnDesc: "Select the transaction for which the discrepancy is being reported.", txnCta: "Report Discrepancy",
      pickTitle: "Select Resource", pickLegend: "Select the resource(s) with discrepancy", detail: "stockDiscrepancy",
      success: "Stock Discrepancy Reported", successDesc: "The stock discrepancy has been recorded successfully for review.", again: "Report Another Discrepancy" }
  };
  const freshSf = flow => ({ flow, txnId: null, picked: [], qty: {}, reason: {}, other: {}, why: {}, actual: {},
    resOpen: false, to: "", vehicle: "", how: "", waybill: "", wbcount: "", transport: "", transportid: "", comments: "" });
  const SF = () => STOCK_FLOWS[state.sf.flow];
  const sfTxn = () => STOCK_TXNS.find(t => t.id === state.sf.txnId);

  const VACCINES = ["OPV (Oral Polio)", "IPV (Inactivated Polio)", "Measles-Rubella", "Pentavalent", "BCG", "Rotavirus"];
  const AEFI_TYPES = ["Serious", "Minor"];

  const SCREENS = {
    home:      { name: "Home", desc: () => "" },
    select:    { name: "Select Vaccination Location", desc: () => "Select the location where you plan to vaccinate children outside households." },
    search:    { name: k => `Search ${KINDS[k].short}`, desc: k => `Search for the ${KINDS[k].described} where you are vaccinating children.` },
    setup:     { name: k => `${KINDS[k].short} Setup`, desc: k => `Add details for the ${KINDS[k].described} where vaccination will take place.` },
    overview:  { name: k => `${KINDS[k].short} Overview`, desc: k => `Vaccinate children at the ${KINDS[k].described} and track your progress.` },
    child:     { name: "Child Details", desc: () => "Add details of the child you are vaccinating." },
    checklist: { name: "Vaccination Checklist", desc: () => "Confirm the vaccination by completing the required checklist." },
    success:   { name: "Vaccination Successful", desc: () => "Vaccination has been recorded successfully." },
    aefiOverview: { name: "AEFI Cases Overview", desc: () => "Report adverse events following vaccination and track the number of reported cases." },
    aefiChild:   { name: "Child Details", desc: () => "Add details of the child who had the adverse event." },
    aefiDetails: { name: "AEFI Case Details", desc: () => "Add details about the vaccine given and the adverse event that followed." },
    aefiKit:     { name: "AEFI Form and Kit Details", desc: () => "Record whether an AEFI form and an AEFI kit (adrenaline) were used for this case." },
    aefiSummary: { name: "Summary", desc: () => "Check the details before you submit the report." },
    aefiSuccess: { name: "AEFI Case Reported", desc: () => "The adverse event has been reported successfully." },
    manageStock: { name: "Manage Stock", desc: () => "" },
    aefiStockOverview: { name: "AEFI Forms and Kits Overview", desc: () => "Track AEFI forms and kits (adrenaline) available and used." },
    aefiStock:   { name: "Record AEFI Forms and Kits", desc: () => "Record AEFI forms and kits (adrenaline) available and used." },
    aefiStockSuccess: { name: "AEFI Forms and Kits Recorded", desc: () => "The AEFI forms and kits have been recorded successfully." },
    stockTxns: { name: () => state.sf.flow === "receipt" ? "Stock Receipt" : "Select Transaction", desc: () => SF().txnDesc || SF().sub },
    receiptList: { name: "Stock Receipt", desc: () => "Record stock received at the warehouse and confirm the resources received." },
    stockReceipt: { name: () => state.rc.wasPending ? "Receive Stock" : "Stock Receipt",
      desc: () => state.rc.wasPending ? "Confirm each resource received or report a discrepancy." : "The resources received in this transaction." },
    receiptConfirm: { name: "Confirm Receipt", desc: () => "Scan the resources received, then confirm the receipt." },
    receiptScan: { name: "Scan QR Code", desc: () => "Point the camera at the resource QR code." },
    receiptReport: { name: "Report Discrepancy", desc: () => "Add the quantity received for this resource." },
    stockForm: { name: () => SF().formTitle, desc: () => SF().sub },
    stockShipment: { name: "Shipment Details", desc: () => "Add the shipment and transport details." },
    stockPick: { name: () => SF().pickTitle, desc: () => `${SF().pickLegend}.` },
    stockDiscrepancy: { name: "Report Stock Discrepancy", desc: () => "Add the quantity that was actually received and what caused the difference." },
    stockSuccess: { name: () => SF().success, desc: () => SF().successDesc }
  };
  const screenName = (route, kind) => { const n = SCREENS[route].name; return typeof n === "function" ? n(kind) : n; };

  // ---------- Persistence ----------
  const STORE_KEY = "aefi-apk-v1";
  const freshStore = () => ({
    recent: { tp: [], clf: [] },
    created: { tp: [], clf: [] },
    progress: { completed: 15, target: 80 },   // My Progress on Home
    aefiStats: { serious: 1, minor: 4 },       // AEFI Cases Overview
    stats: {
      "tp-1": { female: 19, male: 18 },
      "tp-2": { female: 12, male: 9 },
      "clf-1": { female: 18, male: 21 }
    }
  });
  let store;
  try { store = JSON.parse(localStorage.getItem(STORE_KEY)) || freshStore(); } catch (e) { store = freshStore(); }
  if (!store.progress) store.progress = freshStore().progress;
  if (!store.aefiStats) store.aefiStats = freshStore().aefiStats;
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } };

  const allLocations = kind => [...store.created[kind], ...SEED[kind]];
  const findLocation = (kind, id) => allLocations(kind).find(l => l.id === id);
  const statsFor = id => store.stats[id] || (store.stats[id] = { female: 0, male: 0 });

  function markRecent(kind, id) {
    store.recent[kind] = [id, ...store.recent[kind].filter(x => x !== id)].slice(0, 3);
    save();
  }

  // Vaccination checklist — three confirmations, shown ticked and read-only.
  const CHECKLIST = [
    { id: "chk-drops", label: "Two drops administered" },
    { id: "chk-finger", label: "Finger marked" }
  ];

  // ---------- Session state ----------
  const state = {
    route: "home",
    history: [],
    kind: null,
    locationId: null,
    query: "",
    setup: { name: "", type: "", locality: "" },
    child: { name: "", dob: "", years: "", months: "", gender: "" },
    aefi: null,
    stock: null,
    sf: null,             // the Manage Stock record in progress (Receipt, Issued, Returned, Discrepancy)
    rc: null,             // Stock Receipt list and the receipt being received (kept for the session, like the inventory app)
    fromSummary: false,   // editing a section from Summary: Continue returns straight there
    errors: {}
  };

  // ---------- Helpers ----------
  const $phone = document.getElementById("phone");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const K = () => KINDS[state.kind];
  const loc = () => findLocation(state.kind, state.locationId);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const ageText = c => {
    const y = Number(c.years) || 0, m = Number(c.months) || 0;
    return [y ? plural(y, "year") : "", m || !y ? plural(m, "month") : ""].filter(Boolean).join(" ");
  };

  // Date of birth ⇄ age. DOB fills Years/Months; Years/Months back-fill an approximate DOB.
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function ageFromDob(iso) {
    const dob = new Date(`${iso}T00:00`), now = new Date();
    let total = (now.getFullYear() - dob.getFullYear()) * 12 + now.getMonth() - dob.getMonth();
    if (now.getDate() < dob.getDate()) total--;
    return total < 0 ? null : { years: String(Math.floor(total / 12)), months: String(total % 12) };
  }
  function dobFromAge(years, months) {
    const d = new Date();
    d.setMonth(d.getMonth() - (Number(years) || 0) * 12 - (Number(months) || 0));
    return isoDate(d);
  }
  // Child name, DOB/age and gender live in state.child so the shared Child Details fields work unchanged.
  const freshAefi = () => ({ vaccine: "Measles-Rubella",   // preselected; can be changed
    vaxDate: "", onsetDate: "", type: "", desc: "", formUsed: "", kitUsed: "" });
  const MAX_AGE_MONTHS = 59;
  // "2026-10-10" → "10 Oct 2026"
  const shortDate = iso => iso ? new Date(`${iso}T00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";   // polio target group: under 5 years

  const ICON = {
    back: '<svg viewBox="0 0 8 10" aria-hidden="true"><path d="M7 0v10L0 5z" fill="currentColor"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.5-2.8 4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="currentColor"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 14.2a7.2 7.2 0 0 1-6-3.22c.03-1.99 4-3.08 6-3.08s5.97 1.09 6 3.08a7.2 7.2 0 0 1-6 3.22z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>',
    check: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="3"/><path d="m14 24.5 7 7 13-14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>',
    family: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.01 2.01 0 0 0 18.06 7h-.12a2 2 0 0 0-1.9 1.37l-.86 2.58c1.08.6 1.82 1.73 1.82 3.05v8h3zm-7.5-10.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6h1.5v7h4zm6.5 0v-4h1v-4c0-.82-.68-1.5-1.5-1.5h-2c-.82 0-1.5.68-1.5 1.5v4h1v4h3z"/></svg>',
    outside: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 10h5l3-3-3-3h-5V2h-2v2H4v6h7v2H6l-3 3 3 3h5v4h2v-4h7v-6h-7v-2z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    aefi: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM12 17.3c-.72 0-1.3-.58-1.3-1.3s.58-1.3 1.3-1.3 1.3.58 1.3 1.3-.58 1.3-1.3 1.3zm1-4.3h-2V7h2v6z"/></svg>',
    missed: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm.35 2.01C7.62 13.91 2 15.27 2 18v2h9.54c-2.47-2.76-1.23-5.89-1.19-5.99zm9.08 4.01c.36-.59.57-1.28.57-2.02 0-2.21-1.79-4-4-4s-4 1.79-4 4 1.79 4 4 4c.74 0 1.43-.22 2.02-.57L20.59 22 22 20.59l-2.57-2.57zM16 18c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>',
    closedHouse: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 3 2 12h3v8h14v-8h3L12 3zm-2.5 10.5v-1a2.5 2.5 0 0 1 5 0v1h.5V18H9v-4.5h.5zm1.5 0h2v-1a1 1 0 0 0-2 0v1z"/></svg>',
    stock: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"/></svg>',
    complaint: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/></svg>',
    sync: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 12l4-4-4-4v3H3v2h15v3zM6 12l-4 4 4 4v-3h15v-2H6v-3z"/></svg>',
    beneficiary: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm4.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM4.5 16h8v-.75c0-1.35-2.67-2.25-4-2.25s-4 .9-4 2.25V16zm10-6.5V11h5V9.5h-5zm0 3V14h5v-1.5h-5z"/></svg>',
    share: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    book: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/><path fill="currentColor" d="M17.5 10.5c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zm4.5 1.84c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z"/></svg>',
    db: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM2 8v1.5h20V8H2zm6.67 1.5V20H10V9.5H8.67zm5.33 0V20h1.33V9.5H14z"/></svg>',
    bus: '<svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg>',
    outdoor: '<svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.17 9.17c0-3.91-3.19-7.06-7.11-7-3.83.06-6.99 3.37-6.88 7.19.09 3.38 2.58 6.16 5.83 6.7V20H6v-3h1v-4c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v4h1v5h16v-2h-3v-3.88c3.47-.41 6.17-3.36 6.17-6.95zM4.5 11c.83 0 1.5-.67 1.5-1.5S5.33 8 4.5 8 3 8.67 3 9.5 3.67 11 4.5 11z"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    notFound: '<svg class="empty-art" viewBox="0 0 160 124" fill="none" aria-hidden="true">'
      + '<ellipse cx="80" cy="114" rx="52" ry="5" fill="#D6D5D4"/>'
      + '<circle cx="80" cy="60" r="50" fill="#DEEFFF"/>'
      + '<path d="M38 52h16M30 60h10M120 40h14M126 48h8" stroke="#B1C9D6" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M70 26c-12.2 0-22 9.4-22 21.1C48 63.2 70 86 70 86s22-22.8 22-38.9C92 35.4 82.2 26 70 26z" fill="#0B4B66"/>'
      + '<circle cx="70" cy="47" r="8" fill="#fff"/>'
      + '<circle cx="102" cy="74" r="17" fill="#fff" stroke="#C84C0E" stroke-width="5"/>'
      + '<path d="m114.5 86.5 12 12" stroke="#C84C0E" stroke-width="7" stroke-linecap="round"/>'
      + '<path d="M97 69.5a5 5 0 1 1 7.2 4.5c-1.5.8-2.2 1.8-2.2 3.3" stroke="#0B4B66" stroke-width="3" stroke-linecap="round"/>'
      + '<circle cx="102" cy="82.6" r="1.9" fill="#0B4B66"/>'
      + '</svg>',
    gps: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg class="date-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11z"/></svg>',
    receipt: '<svg class="stock-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    issue: '<svg class="stock-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>',
    returned: '<svg class="stock-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>',
    discrepancy: '<svg class="stock-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 19h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 13h2v2h-2zM19 15h2v2h-2z"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z"/></svg>',
    clock: '<svg class="txn-clock" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>',
    medKit: '<svg class="stock-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm6 11h-3v3h-2v-3H8v-2h3v-3h2v3h3v2z"/></svg>',
    error: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r="1" fill="#fff"/></svg>'
  };

  // ---------- Shared components ----------
  const tag = text => `<div class="tag">${ICON.person}<span>${esc(text)}</span></div>`;
  const title = text => `<h1 class="page-title" id="page-title" tabindex="-1">${esc(text)}</h1>`;
  const pairs = rows => `<dl class="pairs">${rows.map(([l, v]) => `<div class="pair"><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  const errorText = (id, msg) => `<p class="field-error" id="${id}-err" ${msg ? "" : "hidden"}>${ICON.error}<span>${esc(msg || "")}</span></p>`;

  function textField({ id, label, value, required, type = "text", help, inputmode, autocomplete = "off", autocapitalize, readonly }) {
    const err = state.errors[id];
    const describedBy = [help ? `${id}-help` : "", `${id}-err`].filter(Boolean).join(" ");
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <input class="input ${err ? "invalid" : ""}" id="${id}" name="${id}" type="${type}" value="${esc(value)}" autocomplete="${autocomplete}"
        ${inputmode ? `inputmode="${inputmode}"` : ""} ${autocapitalize ? `autocapitalize="${autocapitalize}"` : ""} ${readonly ? 'readonly aria-readonly="true"' : ""} ${required ? 'aria-required="true"' : ""} aria-invalid="${!!err}" aria-describedby="${describedBy}" />
      ${help ? `<p class="field-help" id="${id}-help">${esc(help)}</p>` : ""}
      ${errorText(id, err)}
    </div>`;
  }

  function dateField({ id, label, value, required, min, max }) {
    const err = state.errors[id];
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <div class="date-wrap">
        <input class="input date-input ${err ? "invalid" : ""} ${value ? "" : "is-empty"}" id="${id}" type="date" value="${esc(value)}"
          ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} ${required ? 'aria-required="true"' : ""} aria-invalid="${!!err}" aria-describedby="${id}-err" />
        ${ICON.calendar}
      </div>
      ${errorText(id, err)}
    </div>`;
  }

  function textArea({ id, label, value, required, placeholder = "" }) {
    const err = state.errors[id];
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <textarea class="input textarea ${err ? "invalid" : ""}" id="${id}" rows="4" maxlength="500" placeholder="${esc(placeholder)}"
        ${required ? 'aria-required="true"' : ""} aria-invalid="${!!err}" aria-describedby="${id}-err">${esc(value)}</textarea>
      ${errorText(id, err)}
    </div>`;
  }

  function selectField({ id, label, value, options, required }) {
    const err = state.errors[id];
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <div class="select-wrap">
        <select class="input ${err ? "invalid" : ""}" id="${id}" name="${id}" ${required ? 'aria-required="true"' : ""} aria-invalid="${!!err}" aria-describedby="${id}-err">
          <option value="" ${value ? "" : "selected"}>Select</option>
          ${options.map(o => `<option ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}
        </select>${ICON.caret}
      </div>
      ${errorText(id, err)}
    </div>`;
  }

  const reqMark = required => (required ? '<span class="req" aria-hidden="true">*</span>' : "");

  // variant "toggle" = DIGIT toggle buttons (equal-width boxes, selected one filled orange).
  // contained = options sit in a grey secondary container, label and error stay outside it.
  function radioGroup({ id, legend, value, options, inline, required, hidden, toggle, contained }) {
    const err = state.errors[id];
    const option = o => toggle
      ? `<label class="toggle-opt"><input type="radio" name="${id}" value="${esc(o)}" ${o === value ? "checked" : ""}/><span>${esc(o)}</span></label>`
      : `<label class="radio"><input type="radio" name="${id}" value="${esc(o)}" ${o === value ? "checked" : ""}/>${esc(o)}</label>`;
    const optionsClass = `radios ${inline ? "inline" : ""} ${toggle ? "toggle" : ""}`;
    if (contained) {
      return `<fieldset class="field plain-fieldset ${err ? "has-error" : ""}" id="${id}-group" ${hidden ? "hidden" : ""} aria-describedby="${id}-err" ${required ? 'aria-required="true"' : ""}>
        <legend class="field-label">${esc(legend)}${reqMark(required)}</legend>
        <div class="secondary-container ${optionsClass}">${options.map(option).join("")}</div>
        ${errorText(id, err)}
      </fieldset>`;
    }
    return `<fieldset class="field ${optionsClass}" id="${id}-group" ${hidden ? "hidden" : ""} aria-describedby="${id}-err" ${required ? 'aria-required="true"' : ""}>
      <legend>${esc(legend)}${reqMark(required)}</legend>
      ${options.map(option).join("")}
      ${errorText(id, err)}
    </fieldset>`;
  }

  // Date of birth (or) Age — Years + Months, in a secondary container with its label outside.
  function dobAgeField(c) {
    const err = state.errors["child-age"];
    const inv = err ? "invalid" : "";
    const today = new Date(), min = new Date();
    min.setMonth(min.getMonth() - MAX_AGE_MONTHS - 1);
    return `<div class="field" id="child-age-group">
      <p class="field-label" id="child-age-label">Date of birth or age${reqMark(true)}</p>
      <div class="dob-age secondary-container" role="group" aria-labelledby="child-age-label">
        <label class="field-label" for="child-dob">Date of birth</label>
        <div class="date-wrap">
          <input class="input date-input ${inv} ${c.dob ? "" : "is-empty"}" id="child-dob" type="date" value="${esc(c.dob)}"
            min="${isoDate(min)}" max="${isoDate(today)}" aria-describedby="child-age-err" />
          ${ICON.calendar}
        </div>
        <p class="or-divider" aria-hidden="true">(or)</p>
        <fieldset class="age-fieldset">
          <legend class="field-label">Age</legend>
          <div class="age-grid">
            <input class="input ${inv}" id="child-years" inputmode="numeric" maxlength="2" placeholder="Years" aria-label="Age in years" value="${esc(c.years)}" aria-describedby="child-age-err" />
            <input class="input ${inv}" id="child-months" inputmode="numeric" maxlength="2" placeholder="Months" aria-label="Age in months" value="${esc(c.months)}" aria-describedby="child-age-err" />
          </div>
        </fieldset>
      </div>
      ${errorText("child-age", err)}
    </div>`;
  }

  function ageError(c) {
    if (!c.dob && !c.years && !c.months) return "Enter the date of birth or age";
    if (c.dob && !ageFromDob(c.dob)) return "Date of birth can’t be in the future";
    if (Number(c.months) > 11) return "Months must be from 0 to 11";
    if ((Number(c.years) || 0) * 12 + (Number(c.months) || 0) > MAX_AGE_MONTHS) return "Child must be under 5 years old";
    return "";
  }

  // ---------- Manage Stock components ----------
  // Resource / Qty manifest on a transaction card.
  const resTable = (t, heading) => `<table class="res-table">
      <thead><tr><th scope="col">${esc(heading)}</th><th scope="col">Qty</th></tr></thead>
      <tbody>${Object.entries(t.items).map(([n, q]) => `<tr><td>${esc(n)}</td><td>${q}</td></tr>`).join("")}</tbody>
    </table>`;

  // Stock Receipt list card: outcome tag and accent once received; the manifest shows the first 3 resources.
  function receiptCard(t) {
    const pending = t.status === "pending";
    return `<li class="card txn-card ${pending ? "" : t.status}">
        <p class="txn-time">${ICON.clock}${pending ? "Issued on" : "Received on"} ${esc(t.date)} | ${esc(t.time)}</p>
        <div class="txn-main">
          <div class="res-head"><h2 class="txn-id">${esc(t.id)}</h2>${pending ? "" : `<span class="status-chip">${t.status === "confirmed" ? "Completely Received" : "Partially Received"}</span>`}</div>
          <div class="txn-from"><span>Issued from</span><b>${esc(t.from)}</b></div>
          <table class="res-table">
            <thead><tr><th scope="col">${pending ? "Resources issued" : "Resources received"}</th><th scope="col">Qty</th></tr></thead>
            <tbody>${t.resources.slice(0, 3).map(r => `<tr class="${r.status === "discrepancy" ? "row-diff" : ""}"><td>${esc(r.name)}</td><td>${r.received ?? r.quantity}</td></tr>`).join("")}</tbody>
          </table>
          <button class="btn ${pending ? "btn-primary" : "btn-secondary"}" data-action="rc-open" data-id="${t.id}">${pending ? "Receive Stock" : "View Receipt"}</button>
        </div>
      </li>`;
  }

  function receiptListHtml() {
    const rc = state.rc, q = rc.search.trim().toLowerCase();
    const list = rc.txns
      .filter(t => (rc.tab === "pending") === (t.status === "pending"))
      .filter(t => !q || t.id.toLowerCase().includes(q) || t.from.toLowerCase().includes(q) || t.resources.some(r => r.name.toLowerCase().includes(q)))
      .sort((a, b) => rc.sort === "facility" ? a.from.localeCompare(b.from)
        : (rc.sort === "oldest" ? 1 : -1) * (Date.parse(a.date) - Date.parse(b.date)));
    if (!list.length) return `<p class="rc-empty">${ICON.inbox}${rc.tab === "pending" ? "No stock receipts to receive" : "No completed stock receipts"}</p>`;
    return `<ul class="txn-list">${list.map(receiptCard).join("")}</ul>`;
  }

  // Sort sheet: the choice only applies on Apply; Clear goes back to the default.
  const sortSheet = () => `<div class="sheet-backdrop dialog-backdrop sort-backdrop">
      <div class="dialog sort-dialog" role="dialog" aria-modal="true" aria-labelledby="sort-title">
        <h2 class="sort-title" id="sort-title">${ICON.sort}Sort</h2>
        <fieldset class="secondary-container sort-box">
          <legend class="sort-legend">Sort by</legend>
          ${SORT_OPTIONS.map(([k, l]) => `<label class="radio"><input type="radio" name="sf-sort" value="${k}" ${state.rc.draft === k ? "checked" : ""}/>${esc(l)}</label>`).join("")}
        </fieldset>
        <div class="footer-row"><button class="btn btn-secondary" data-action="rc-sort-clear">Clear</button><button class="btn btn-primary" data-action="rc-sort-apply">Apply</button></div>
      </div>
    </div>`;

  const mismatchDialog = () => `<div class="sheet-backdrop dialog-backdrop">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="mm-title" aria-describedby="mm-desc">
        <h2 class="dialog-title" id="mm-title">${ICON.discrepancy}Stock Quantity Mismatch</h2>
        <p id="mm-desc">The quantity scanned does not match the expected quantity. Please review the quantities before confirming receipt.</p>
        <button class="btn btn-primary" data-action="rc-mismatch-confirm">Confirm Receipt</button>
        <button class="btn btn-secondary" data-action="rc-mismatch-back">Go Back</button>
      </div>
    </div>`;

  // Which transaction and resource a Confirm Receipt / Report Discrepancy screen is about.
  const resTag = (line, name) => `<div class="res-tag"><span>${esc(line)}</span><b>${esc(name)}</b></div>`;

  // Reason for discrepancy: damage (dropdown) explains a shortfall; when more was received
  // than expected the dropdown is replaced by a required comment.
  const isOver = (raw, expected) => /^\d+$/.test(String(raw ?? "").trim()) && Number(raw) > expected;
  function reasonFields(i, name, expected) {
    const f = state.sf, over = isOver(f.actual[name], expected);
    return `<div id="sf-reason-${i}-wrap" ${over ? "hidden" : ""}>
        ${selectField({ id: `sf-reason-${i}`, label: "Reason for discrepancy", value: f.reason[name] || "", options: DISCREPANCY_REASONS, required: true })}
        ${otherField(`sf-other-${i}`, f.other[name] || "", f.reason[name] === "Other")}
      </div>
      <div id="sf-why-${i}-wrap" ${over ? "" : "hidden"}>
        ${textArea({ id: `sf-why-${i}`, label: "Reason for discrepancy", value: f.why[name] || "", required: true, placeholder: "Explain why more was received than expected" })}
      </div>`;
  }

  // Signed difference between the quantity received and expected: red for a shortfall, green for an overage.
  function diffTag(raw, expected, unit) {
    if (raw == null || !/^\d+$/.test(String(raw).trim())) return "";
    const diff = Number(raw) - expected;
    return diff ? `<span class="diff-tag ${diff < 0 ? "short" : "over"}">${diff > 0 ? "+" : "-"}${Math.abs(diff)} ${esc(unit)}</span>` : "";
  }

  // Resource(s) multi-select dropdown, as in the inventory app: the trigger shows "N Selected",
  // the panel stays open while picking, and the picks show as chips with Clear All.
  function resourceDropdown() {
    const err = state.errors["sf-res"], f = state.sf, open = f.resOpen;
    return `<div class="field ms" id="sf-res-group">
        <label class="field-label" id="sf-res-label" for="sf-res">Resource(s)${reqMark(true)}</label>
        <div class="select-wrap">
          <button type="button" class="input ms-trigger ${err ? "invalid" : ""} ${f.picked.length ? "" : "is-empty"}" id="sf-res" data-action="sf-res-open"
            aria-haspopup="true" aria-expanded="${!!open}" aria-controls="sf-res-panel" aria-labelledby="sf-res-label sf-res" aria-invalid="${!!err}" aria-describedby="sf-res-err">${f.picked.length ? `${f.picked.length} Selected` : "Select resource(s)"}</button>${ICON.caret}
        </div>
        <fieldset class="ms-panel" id="sf-res-panel" ${open ? "" : "hidden"}>
          <legend class="sr-only">Resource(s)</legend>
          ${STOCK_RESOURCES.map(r => `<label class="checkbox"><input type="checkbox" name="sf-res" value="${esc(r.name)}" ${f.picked.includes(r.name) ? "checked" : ""}/><span class="box">${ICON.tick}</span>${esc(r.name)}</label>`).join("")}
        </fieldset>
        ${f.picked.length ? `<div class="ms-chips">
            ${f.picked.map(n => `<span class="ms-chip">${esc(n)}</span>`).join("")}
            <button type="button" class="ms-clear" data-action="sf-res-clear">Clear All</button>
          </div>` : ""}
        ${errorText("sf-res", err)}
      </div>`;
  }

  // Resource checkboxes; each checked resource can show its own fields (extra) right under it.
  function resourceChecks(legend, names, extra = () => "") {
    const err = state.errors["sf-res"], picked = state.sf.picked;
    return `<fieldset class="field plain-fieldset ${err ? "has-error" : ""}" id="sf-res-group" aria-describedby="sf-res-err" aria-required="true">
        <legend class="field-label">${esc(legend)}${reqMark(true)}</legend>
        <div class="checklist res-checks">
          ${names.map(n => `<div><label class="checkbox"><input type="checkbox" name="sf-res" value="${esc(n)}" ${picked.includes(n) ? "checked" : ""}/><span class="box">${ICON.tick}</span>${esc(n)}</label>
            ${picked.includes(n) ? extra(n) : ""}</div>`).join("")}
        </div>
        ${errorText("sf-res", err)}
      </fieldset>`;
  }

  // ---------- Screens ----------
  // Each returns { tag, body, footer }.
  const VIEWS = {
    home() {
      const p = store.progress, pct = Math.min(100, Math.round((p.completed / p.target) * 100));
      // "|" in a label marks the line break; it's stripped for the accessible name/toast.
      const lines = (label) => label.split("|").map(esc).join("<br>");
      const tile = (action, icon, label) => `<li><button class="home-tile" data-action="${action}" aria-label="${esc(label.replace("|", " "))}">${ICON[icon]}<span>${lines(label)}</span></button></li>`;
      // Tiles with no screens yet: tapping shows a toast.
      const soon = (icon, label) => `<li><button class="home-tile" data-action="not-in-prototype" data-label="${esc(label.replace("|", " "))}">${ICON[icon]}<span>${lines(label)}</span></button></li>`;
      return {
        body: `<h1 class="sr-only" id="page-title" tabindex="-1">Home</h1>
          <section class="card progress-card" aria-labelledby="progress-title">
            <h2 class="progress-title" id="progress-title">My Progress</h2>
            <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${p.target}" aria-valuenow="${p.completed}" aria-labelledby="progress-title">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <p class="progress-text"><span>${p.completed} completed</span> / ${p.target}</p>
          </section>
          <ul class="home-tiles">
            ${tile("enumeration", "family", "Enumeration and Vaccination")}
            ${tile("outside-household", "outside", "Outside Household Vaccination")}
            ${tile("report-aefi", "aefi", "Report AEFI")}
            ${soon("missed", "Missed Children")}
            ${tile("manage-stock", "stock", "Manage Stock")}
            ${soon("closedHouse", "Mark Closed Household")}
            ${soon("complaint", "File Complaint")}
            ${soon("sync", "Sync Data")}
            ${soon("beneficiary", "Beneficiary IDs")}
            ${soon("share", "Share Data")}
            ${soon("sync", "Update Stock Data")}
            ${soon("db", "DB")}
          </ul>
          <p class="powered">Powered by <b>DIGIT</b></p>`,
        footer: ""
      };
    },

    aefiOverview() {
      const s = store.aefiStats;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("AEFI Cases Overview")}
          <div class="card">
            <p class="metric-value">${s.serious + s.minor}</p>
            <p class="metric-label">Total AEFI cases reported</p>
            <div class="chips chips-stack">
              <div class="chip"><b>${s.serious}</b>Serious AEFI cases</div>
              <div class="chip"><b>${s.minor}</b>Minor AEFI cases</div>
            </div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-start">Report AEFI Case</button>`
      };
    },

    aefiChild() {
      const c = state.child;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Child Details")}
          <div class="card">
            ${textField({ id: "child-name", label: "Child name", value: c.name, required: true, autocapitalize: "words" })}
            ${dobAgeField(c)}
            ${radioGroup({ id: "child-gender", legend: "Gender", value: c.gender, options: ["Male", "Female"], toggle: true, contained: true, required: true })}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-child-continue">Continue</button>`
      };
    },

    aefiDetails() {
      const a = state.aefi, today = isoDate(new Date());
      return {
        tag: ASSIGNED_AREA,
        body: `${title("AEFI Case Details")}
          <div class="card">
            ${selectField({ id: "aefi-vaccine", label: "Vaccine administered", value: a.vaccine, options: VACCINES, required: true })}
            ${dateField({ id: "aefi-vax-date", label: "Date of vaccination", value: a.vaxDate, required: true, max: today })}
            ${dateField({ id: "aefi-onset-date", label: "Date of AEFI onset", value: a.onsetDate, required: true, min: a.vaxDate, max: today })}
            ${radioGroup({ id: "aefi-type", legend: "AEFI type", value: a.type, options: AEFI_TYPES, toggle: true, contained: true, required: true })}
            ${textArea({ id: "aefi-desc", label: "Description", value: a.desc, required: true, placeholder: "Describe the symptoms and what happened" })}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-submit">Continue</button>`
      };
    },

    aefiKit() {
      return {
        tag: ASSIGNED_AREA,
        body: `${title("AEFI Form and Kit Details")}
          <div class="card">
            ${radioGroup({ id: "aefi-form-used", legend: "Was an AEFI form used for this case?", value: state.aefi.formUsed, options: ["Yes", "No"], required: true })}
            <hr class="q-divider" />
            <div>${radioGroup({ id: "aefi-kit-used", legend: "Was an AEFI kit (adrenaline) used for this case?", value: state.aefi.kitUsed, options: ["Yes", "No"], required: true })}</div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-kit-continue">Continue</button>`
      };
    },

    aefiSummary() {
      // Two section cards, each with its heading and an Edit link that jumps back to that page.
      const a = state.aefi, c = state.child;
      state.fromSummary = false;
      const section = (heading, page, rows) => `<section class="card summary-card" aria-labelledby="sum-${page}">
          <div class="summary-card-head">
            <h2 class="summary-heading" id="sum-${page}">${esc(heading)}</h2>
            <button class="btn-tertiary" data-action="aefi-edit" data-page="${page}" aria-label="Edit ${esc(heading.toLowerCase())}">${ICON.edit}Edit</button>
          </div>
          ${pairs(rows)}
        </section>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Summary")}
          ${section("Child Details", "aefiChild", [
            ["Child name", c.name.trim()],
            ["Age", ageText(c)],
            ["Gender", c.gender]
          ])}
          ${section("AEFI Case Details", "aefiDetails", [
            ["Vaccine administered", a.vaccine],
            ["Date of vaccination", shortDate(a.vaxDate)],
            ["Date of AEFI onset", shortDate(a.onsetDate)],
            ["AEFI type", a.type],
            ["Description", a.desc.trim()]
          ])}
          ${section("AEFI Form and Kit Details", "aefiKit", [
            ["AEFI form used", a.formUsed],
            ["AEFI kit used", a.kitUsed]
          ])}`,
        footer: `<button class="btn btn-primary" data-action="aefi-confirm">Submit</button>`
      };
    },

    aefiSuccess() {
      return {
        tag: ASSIGNED_AREA,
        body: `<div class="card panel-card">
            <div class="success-panel" role="status">
              ${ICON.check}
              <h1 class="success-title" id="page-title" tabindex="-1">AEFI Case Reported</h1>
            </div>
            <p class="success-desc">${esc(SCREENS.aefiSuccess.desc())}</p>
            <div class="panel-actions">
              <button class="btn btn-primary" data-action="aefi-another">Report Another AEFI Case</button>
              <button class="btn btn-secondary" data-action="to-aefi-overview">Back to Overview</button>
            </div>
          </div>`,
        footer: ""
      };
    },

    manageStock() {
      // Same list of stock records as the inventory app, plus AEFI Forms and Kits.
      const card = (action, icon, label, sub, flow = "") => `<li><button class="stock-card" data-action="${action}" ${flow ? `data-flow="${flow}"` : ""}>
          ${ICON[icon]}<span class="stock-title">${esc(label)}</span><span class="stock-sub">${esc(sub)}</span>
        </button></li>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Manage Stock")}
          <ul class="stock-list" aria-labelledby="page-title">
            ${Object.entries(STOCK_FLOWS).map(([flow, f]) => card("sf-open", f.icon, f.card, f.sub, flow)).join("")}
            ${card("aefi-stock-overview", "medKit", "AEFI Forms and Kits", "Track and record AEFI forms and kits (adrenaline) available and used.")}
          </ul>`,
        footer: ""
      };
    },

    // Dashboard: available and used from the latest record.
    aefiStockOverview() {
      const last = (store.aefiStock || [])[0];
      const qtyOf = key => !last ? "–" : last[key] !== "Yes" ? "0" : last[`${key}Qty`] || "Yes";
      // Each heading sits above its white card; the card holds Available and Used in secondary containers.
      const item = (heading, availKey, usedKey) => `<section aria-labelledby="ov-${availKey}">
          <h2 class="section-title ov-title" id="ov-${availKey}">${esc(heading)}</h2>
          <div class="card ov-pair">
            <p class="secondary-container ov-stat"><span>Available</span><b>${esc(qtyOf(availKey))}</b></p>
            <p class="secondary-container ov-stat"><span>Used</span><b>${esc(qtyOf(usedKey))}</b></p>
          </div>
        </section>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("AEFI Forms and Kits Overview")}
          ${item("AEFI Forms", "formAvailable", "formUsed")}
          ${item("AEFI Kits (adrenaline)", "kitAvailable", "kitUsed")}`,
        footer: ""   // Record CTA removed for now
      };
    },

    aefiStock() {
      const s = state.stock;
      // A Yes opens secondary containers below the Yes / No options. For "available": one with how many,
      // and one with the dependent "used" question, whose Yes in turn opens how many were used.
      const question = q => {
        const err = state.errors[q.id], dep = STOCK_QUESTIONS.find(d => d.dependsOn === q.key);
        const opt = v => `<label class="radio"><input type="radio" name="${q.id}" value="${v}" ${s[q.key] === v ? "checked" : ""}/>${v}</label>`;
        return `<fieldset class="field radios stock-q ${err ? "has-error" : ""}" id="${q.id}-group" aria-describedby="${q.id}-err" aria-required="true">
            <legend>${esc(q.label)}${reqMark(true)}</legend>
            ${opt("Yes")}
            ${opt("No")}
            ${errorText(q.id, err)}
            <div class="dep-stack" id="${q.id}-wrap" ${s[q.key] === "Yes" ? "" : "hidden"}>
              <div class="secondary-container">
                ${textField({ id: `${q.id}-qty`, label: q.qty, value: s[`${q.key}Qty`], inputmode: "numeric" })}
              </div>
              ${dep ? `<div class="secondary-container">${question(dep)}</div>` : ""}
            </div>
          </fieldset>`;
      };
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Record AEFI Forms and Kits")}
          <div class="card">
            ${question(STOCK_QUESTIONS[0])}
            <hr class="q-divider" />
            <div>${question(STOCK_QUESTIONS[2])}</div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-stock-submit">Submit</button>`
      };
    },

    aefiStockSuccess() {
      return {
        tag: ASSIGNED_AREA,
        body: `<div class="card panel-card">
            <div class="success-panel" role="status">
              ${ICON.check}
              <h1 class="success-title" id="page-title" tabindex="-1">AEFI Forms and Kits Recorded</h1>
            </div>
            <p class="success-desc">${esc(SCREENS.aefiStockSuccess.desc())}</p>
            <div class="panel-actions">
              <button class="btn btn-primary" data-action="aefi-stock">Record Again</button>
              <button class="btn btn-secondary" data-action="back">Back to Overview</button>
            </div>
          </div>`,
        footer: ""
      };
    },

    // ---------- Manage Stock flows ----------
    stockTxns() {
      const f = state.sf, receipt = f.flow === "receipt";
      const card = t => `<li class="card txn-card">
          <p class="txn-time">${ICON.clock}${receipt ? "Issued on" : "Received on"} ${esc(t.date)} | ${esc(t.time)}</p>
          <div class="txn-main">
            <h2 class="txn-id">${esc(t.id)}</h2>
            <div class="txn-from"><span>Issued from</span><b>${esc(t.from)}</b></div>
            ${resTable(t, receipt ? "Resources issued" : "Resources received")}
            <button class="btn btn-primary" data-action="sf-txn" data-id="${t.id}">${esc(SF().txnCta)}</button>
          </div>
        </li>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title(screenName("stockTxns"))}
          <ul class="txn-list">${STOCK_TXNS.map(card).join("")}</ul>`,
        footer: ""
      };
    },

    // Stock Receipt follows the inventory app: list (Yet to Receive | Received, search, sort)
    // → Receive Stock → per resource Confirm Receipt (with QR scan) or Report Discrepancy → Submit.
    receiptList() {
      const rc = state.rc;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Stock Receipt")}
          <div class="card seg-card">
            <div class="seg" role="tablist" aria-label="Stock receipts">
              ${[["pending", "Yet to Receive"], ["received", "Received"]].map(([k, l]) => `<button class="seg-tab" role="tab" aria-selected="${rc.tab === k}" data-action="rc-tab" data-tab="${k}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="rc-tools">
            <div class="rc-search">${ICON.search}<input class="input" id="sf-search" type="search" value="${esc(rc.search)}" autocomplete="off"
              placeholder="Search resource or transaction ID" aria-label="Search resource or transaction ID" aria-controls="rc-list" /></div>
            <button class="rc-sort" data-action="rc-sort-open" aria-haspopup="dialog">${ICON.sort}Sort</button>
          </div>
          <div id="rc-list" role="tabpanel" aria-live="polite">${receiptListHtml()}</div>`,
        footer: "",
        overlay: rc.sortOpen ? sortSheet() : ""
      };
    },

    stockReceipt() {
      const rc = state.rc, t = rcTxn();
      const BADGE = { pending: "Not Received", confirmed: "Completely Received", discrepancy: "Partially Received" };
      const item = (r, i) => {
        const done = r.status !== "pending", unit = resUnit(r.name);
        return `<section class="card res-card ${r.status}" id="rc-st-${i}" tabindex="-1" aria-labelledby="rc-name-${i}">
            <div class="res-head"><h3 class="summary-heading" id="rc-name-${i}">${esc(r.name)}</h3><span class="status-chip">${BADGE[r.status]}</span></div>
            <div class="res-qty">
              <p class="res-expected"><span>Expected</span><b>${r.quantity} ${esc(unit)}</b></p>
              ${done ? `<p class="res-expected res-received ${r.received !== r.quantity ? "diff" : ""}"><span>${r.status === "discrepancy" ? "Partially received" : "Received"}</span><b>${r.received} ${esc(unit)}</b></p>` : ""}
            </div>
            ${r.reason ? `<p class="res-expected res-reason"><span>Reason for discrepancy</span><b>${esc(r.reason)}</b></p>` : ""}
            ${r.comment ? `<p class="res-expected res-reason"><span>Comment</span><b class="res-comment">${esc(r.comment)}</b></p>` : ""}
            ${done ? "" : `<div class="res-actions">
                <button class="btn btn-secondary" data-action="rc-report" data-r="${i}">Report Discrepancy</button>
                <button class="btn btn-primary" data-action="rc-confirm" data-r="${i}">Confirm Receipt</button>
              </div>`}
            ${errorText(`rc-st-${i}`, state.errors[`rc-st-${i}`])}
          </section>`;
      };
      return {
        tag: ASSIGNED_AREA,
        body: `${title(screenName("stockReceipt"))}
          <div class="card">${pairs([["Transaction ID", t.id], ["Sending facility", t.from], ["Date received", t.date]])}</div>
          <h2 class="section-title rc-res-title">Resources</h2>
          ${t.resources.map(item).join("")}`,
        // Submit only when the receipt was opened to receive it (not from View Receipt).
        footer: rc.wasPending ? `<button class="btn btn-primary" data-action="rc-submit">Submit</button>` : ""
      };
    },

    receiptConfirm() {
      const rc = state.rc, r = rcRes();
      const scanBtn = label => `<button class="btn btn-secondary scan-btn" data-action="rc-scan-open">${ICON.qr}${label}</button>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Confirm Receipt")}
          ${resTag(rcTxn().id, r.name)}
          <div class="card">
            ${textField({ id: "rc-expected", label: `Quantity expected (${resUnit(r.name)})`, value: r.quantity, readonly: true })}
            ${rc.scans ? `<p class="scan-summary" role="status">${ICON.tick}${plural(rc.scans, "Resource")} Scanned</p>${scanBtn("Continue Scanning")}` : scanBtn("Scan Resources")}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="rc-confirm-submit">Confirm Receipt</button>`,
        overlay: rc.mismatch ? mismatchDialog() : ""
      };
    },

    receiptScan() {
      const rc = state.rc;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Scan QR Code")}
          <p class="page-desc" role="status">${rc.scanned ? "QR code scanned successfully." : "Point the camera at the resource QR code."}</p>
          ${resTag(rcTxn().id, rcRes().name)}
          <div class="scanner ${rc.scanned ? "done" : ""}" aria-hidden="true">${rc.scanned ? ICON.tick : '<span class="scan-line"></span>'}</div>`,
        footer: rc.scanned
          ? `<div class="footer-row"><button class="btn btn-secondary" data-action="rc-rescan">Rescan</button><button class="btn btn-primary" data-action="rc-scan-add">Add Scan</button></div>`
          : `<button class="btn btn-primary" data-action="rc-scan">${ICON.qr}Scan QR Code</button>`
      };
    },

    receiptReport() {
      const rc = state.rc, r = rcRes(), unit = resUnit(r.name);
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Report Discrepancy")}
          ${resTag(rcTxn().id, r.name)}
          <div class="card">
            ${textField({ id: "rc-expected", label: `Quantity expected (${unit})`, value: r.quantity, readonly: true })}
            ${textField({ id: "sf-rcv", label: `Quantity received (${unit})`, value: rc.rcv, required: true, inputmode: "numeric" })}
            <p class="diff-wrap" id="sf-diff">${diffTag(rc.rcv, r.quantity, unit)}</p>
            <div id="sf-reason-wrap">
              ${selectField({ id: "sf-reason", label: "Reason for discrepancy", value: rc.reason, options: DISCREPANCY_REASONS, required: true })}
              ${otherField("sf-other", rc.other, rc.reason === "Other")}
            </div>
            ${textArea({ id: "sf-comment", label: "Comment", value: rc.comment })}
            <button class="btn btn-secondary scan-btn" data-action="rc-qr" ${rc.qr ? "disabled" : ""}>${ICON.qr}${rc.qr ? "QR Scanned ✓" : "Scan QR Code"}</button>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="rc-report-submit">Submit</button>`
      };
    },

    stockForm() {
      const f = state.sf, cfg = SF(), issue = f.flow === "issue";
      // One card per selected resource, in the order picked; X removes it (as in the inventory app).
      const qty = name => {
        const i = resIndex(name), r = STOCK_RESOURCES[i];
        return `<section class="secondary-container res-qty-card" aria-labelledby="sf-name-${i}">
            <div class="res-head">
              <h2 class="res-qty-name" id="sf-name-${i}">${esc(name)}</h2>
              <button class="icon-x" data-action="sf-res-remove" data-i="${i}" aria-label="Remove ${esc(name)}">${ICON.close}</button>
            </div>
            ${textField({ id: `sf-qty-${i}`, label: `${cfg.qtyLabel} (${r.unit})`, value: f.qty[name] || "", required: true, inputmode: "numeric",
              help: issue ? `Available stock: ${r.available} ${r.unit}` : "" })}
          </section>`;
      };
      return {
        tag: ASSIGNED_AREA,
        body: `${title(cfg.formTitle)}
          <div class="card">
            ${textField({ id: "sf-from", label: cfg.fromLabel, value: CURRENT_FACILITY, readonly: true })}
            ${resourceDropdown()}
            ${f.picked.map(qty).join("")}
            ${selectField({ id: "sf-to", label: cfg.toLabel, value: f.to, options: FACILITIES, required: true })}
            ${radioGroup({ id: "sf-vehicle", legend: "Was a vehicle involved during the transaction?", value: f.vehicle, options: ["Yes", "No"], required: true })}
            <div id="sf-how-wrap" ${f.vehicle === "No" ? "" : "hidden"}>
              ${textArea({ id: "sf-how", label: "How was the stock transferred?", value: f.how, placeholder: "Describe how the stock was transferred" })}
            </div>
          </div>`,
        footer: `<button class="btn btn-primary" id="sf-form-btn" data-action="sf-form-continue">${f.vehicle === "Yes" ? "Continue" : "Submit"}</button>`
      };
    },

    stockShipment() {
      const f = state.sf;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Shipment Details")}
          <div class="card">
            ${textField({ id: "sf-waybill", label: "Waybill number", value: f.waybill, required: true })}
            ${textField({ id: "sf-wbcount", label: "Resources indicated on waybill", value: f.wbcount, inputmode: "numeric" })}
            ${selectField({ id: "sf-transport", label: "Type of transport", value: f.transport, options: TRANSPORT_TYPES, required: true })}
            ${textField({ id: "sf-transportid", label: "Transport number / ID", value: f.transportid })}
            ${textArea({ id: "sf-comments", label: "Comments", value: f.comments, placeholder: "Add any additional context" })}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="sf-ship-submit">Submit</button>`
      };
    },

    stockPick() {
      const cfg = SF();
      return {
        tag: ASSIGNED_AREA,
        body: `${title(cfg.pickTitle)}
          <div class="card">${resourceChecks(cfg.pickLegend, Object.keys(sfTxn().items))}</div>`,
        footer: `<button class="btn btn-primary" data-action="sf-pick-continue">Continue</button>`
      };
    },

    stockDiscrepancy() {
      const f = state.sf, t = sfTxn();
      const item = name => {
        const i = resIndex(name), unit = resUnit(name);
        return `<section class="card" aria-labelledby="sf-name-${i}">
            <h2 class="summary-heading" id="sf-name-${i}">${esc(name)}</h2>
            ${textField({ id: `sf-expected-${i}`, label: `Expected quantity (${unit})`, value: t.items[name], readonly: true })}
            ${textField({ id: `sf-actual-${i}`, label: `Actual quantity received (${unit})`, value: f.actual[name] || "", required: true, inputmode: "numeric", help: "Enter the quantity that was actually received." })}
            <p class="diff-wrap" id="sf-diff-${i}">${diffTag(f.actual[name], t.items[name], unit)}</p>
            ${reasonFields(i, name, t.items[name])}
          </section>`;
      };
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Report Stock Discrepancy")}${f.picked.map(item).join("")}`,
        footer: `<button class="btn btn-primary" data-action="sf-disc-submit">Submit</button>`
      };
    },

    stockSuccess() {
      const cfg = SF();
      return {
        tag: ASSIGNED_AREA,
        body: `<div class="card panel-card">
            <div class="success-panel" role="status">
              ${ICON.check}
              <h1 class="success-title" id="page-title" tabindex="-1">${esc(cfg.success)}</h1>
            </div>
            <p class="success-desc">${esc(cfg.successDesc)}</p>
            <div class="panel-actions">
              <button class="btn btn-primary" data-action="sf-again">${esc(cfg.again)}</button>
              <button class="btn btn-secondary" data-action="go-home">Go to Home</button>
            </div>
          </div>`,
        footer: ""
      };
    },

    select() {
      // Whole card is the tap target and goes straight to that location type's search.
      const opt = (kind, label) => `<li><button class="option-card" data-action="pick-kind" data-kind="${kind}">
          ${ICON[kind === "tp" ? "bus" : "outdoor"]}
          <span class="option-main"><span class="option-title">${esc(label)}</span><span class="option-sub">${esc(KINDS[kind].optionSub)}</span></span>
        </button></li>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Select Vaccination Location")}
          <ul class="option-list" aria-labelledby="page-title">
            ${opt("tp", "Transit Post")}
            ${opt("clf", "Outside Household Place")}
          </ul>`,
        footer: ""
      };
    },

    search() {
      const k = K();
      return {
        tag: ASSIGNED_AREA,
        body: `${title(`Search ${k.short}`)}
          <div class="search" role="search">
            ${ICON.search}
            <label class="sr-only" for="search-input">Search ${esc(k.lower)} by name, type or area</label>
            <input class="input" id="search-input" type="search" placeholder="Search by name, type or area" value="${esc(state.query)}" autocomplete="off" />
          </div>
          <div id="search-results">${searchResultsHtml()}</div>`,
        footer: createBtnHtml()
      };
    },

    setup() {
      const k = K();
      return {
        tag: state.setup.locality || ASSIGNED_AREA,
        body: `${title(`${k.short} Setup`)}
          <div class="card">
            ${textField({ id: "setup-name", label: k.nameLabel, value: state.setup.name, required: true })}
            ${selectField({ id: "setup-type", label: k.typeLabel, value: state.setup.type, options: k.types, required: true })}
            ${selectField({ id: "setup-locality", label: k.areaLabel, value: state.setup.locality, options: LOCALITIES, required: true })}
            <div class="field">
              <label class="field-label" for="setup-gps">GPS accuracy</label>
              <input class="input" id="setup-gps" value="8 m" readonly aria-describedby="gps-ok" />
              <p class="gps" id="gps-ok">${ICON.gps}Captured automatically</p>
            </div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="setup-continue">Continue</button>`
      };
    },

    overview() {
      const k = K(), l = loc(), s = statsFor(l.id);
      return {
        tag: l.locality,
        body: `${title(`${k.short} Overview`)}
          <div class="card">${pairs([[k.nameLabel, l.name], [k.typeLabel, l.type]])}</div>
          <h2 class="section-title">Today’s Progress</h2>
          <div class="card">
            <p class="metric-value">${s.female + s.male}</p>
            <p class="metric-label">Vaccinated Children</p>
            <div class="chips">
              <div class="chip"><b>${s.female}</b>Female</div>
              <div class="chip"><b>${s.male}</b>Male</div>
            </div>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="vaccinate">Vaccinate</button>`
      };
    },

    child() {
      const c = state.child;
      return {
        tag: loc().name,
        body: `${title("Child Details")}
          <div class="card">
            ${textField({ id: "child-name", label: "Child name", value: c.name, required: true, autocomplete: "off" })}
            ${dobAgeField(c)}
            ${radioGroup({ id: "child-gender", legend: "Gender", value: c.gender, options: ["Female", "Male"], toggle: true, contained: true, required: true })}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="child-continue">Continue</button>`
      };
    },

    checklist() {
      return {
        tag: loc().name,
        body: `${title("Vaccination Checklist")}
          <div class="card">
            <fieldset class="plain-fieldset checklist" disabled>
              <legend class="sr-only">Vaccination checklist</legend>
              ${CHECKLIST.map(i => `<label class="checkbox"><input type="checkbox" name="${i.id}" checked disabled/><span class="box">${ICON.tick}</span>${esc(i.label)}</label>`).join("")}
            </fieldset>
          </div>`,
        footer: `<button class="btn btn-primary" data-action="submit-checklist">Submit</button>`
      };
    },

    success() {
      // DIGIT panel card: page title in the green panel, description below it on white, CTAs stacked below.
      return {
        tag: loc().name,
        body: `<div class="card panel-card">
            <div class="success-panel" role="status">
              ${ICON.check}
              <h1 class="success-title" id="page-title" tabindex="-1">Vaccination Successful</h1>
            </div>
            <p class="success-desc">${esc(SCREENS.success.desc())}</p>
            <div class="panel-actions">
              <button class="btn btn-primary" data-action="next-child">Vaccinate Another Child</button>
              <button class="btn btn-secondary" data-action="to-overview">Back to Overview</button>
            </div>
          </div>`,
        footer: ""
      };
    }
  };

  // ---------- Smarter nearby search ----------
  // Empty query: only the last-used locations (returning user); first-time users see just the search box.
  // Typed query: ranks name-prefix > word-prefix > name-contains > type/area match, then distance.
  function scoreLocation(l, q) {
    const name = l.name.toLowerCase();
    let best = 0;
    for (const t of q.split(/\s+/).filter(Boolean)) {
      let s = 0;
      if (name.startsWith(t)) s = 4;
      else if (name.split(/[\s'.-]+/).some(w => w.startsWith(t))) s = 3;
      else if (name.includes(t)) s = 2;
      else if (l.type.toLowerCase().includes(t) || l.locality.toLowerCase().includes(t)) s = 1;
      if (!s) return 0;           // every word must match somewhere
      best += s;
    }
    return best;
  }

  function highlight(name, q) {
    const t = q.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!t.length) return esc(name);
    const re = new RegExp(`(${t.join("|")})`, "gi");
    return name.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
  }

  function locItem(l, q) {
    // Name on top, details stacked as label/value rows, Select button at the bottom.
    const k = K();
    return `<li><article class="loc-card" aria-labelledby="loc-${esc(l.id)}">
      <h3 class="loc-name" id="loc-${esc(l.id)}">${highlight(l.name, q)}</h3>
      <dl class="loc-rows">
        <div><dt>Type</dt><dd>${esc(l.type)}</dd></div>
        <div><dt>Area</dt><dd>${esc(l.locality)}</dd></div>
      </dl>
      <button class="btn btn-secondary loc-select" data-action="pick-location" data-id="${esc(l.id)}" aria-describedby="loc-${esc(l.id)}">Select ${esc(k.cta)}</button>
    </article></li>`;
  }

  function searchHits() {
    const q = state.query.trim().toLowerCase();
    if (!q) return null;
    return allLocations(state.kind).map(l => ({ l, s: scoreLocation(l, q) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.l.km - b.l.km).map(x => x.l);
  }
  // Create is offered only once a search has returned nothing.
  const noMatch = () => { const h = searchHits(); return !!h && !h.length; };

  // Create CTA: primary button, disabled until a search returns nothing.
  function createBtnHtml() {
    return `<button class="btn btn-primary" id="create-btn" data-action="create" ${noMatch() ? "" : "disabled"}>${ICON.add}Create ${esc(K().cta)}</button>`;
  }

  const NEARBY_KM = 5;   // radius for the default "nearby" list

  function searchResultsHtml() {
    const k = K(), q = state.query.trim().toLowerCase();
    // Default view: locations within NEARBY_KM, nearest first, with a count.
    if (!q) {
      const near = allLocations(state.kind).filter(l => l.km <= NEARBY_KM).sort((a, b) => a.km - b.km);
      if (!near.length) return "";
      return `<p class="search-meta" role="status" style="margin:12px 0">${near.length} nearby ${esc(k.lower)}${near.length > 1 ? "s" : ""}</p>
      <ul class="loc-list">${near.map(l => locItem(l, "")).join("")}</ul>`;
    }

    const hits = searchHits();

    if (!hits.length) {
      return `<div class="empty" role="status">
          ${ICON.notFound}
          <h3>${esc(k.short)} Not Found</h3>
          <p>No ${esc(k.lower)} matches “${esc(state.query.trim())}”. Check the spelling or create a new ${esc(k.lower)}.</p>
        </div>`;
    }
    return `<p class="search-meta" role="status" style="margin:12px 0">${hits.length} search result${hits.length > 1 ? "s" : ""}</p>
      <ul class="loc-list">${hits.map(l => locItem(l, q)).join("")}</ul>`;
  }

  // ---------- Render ----------
  function render({ focusTitle = true } = {}) {
    const view = VIEWS[state.route]();
    const chrome = state.route === "home"
      ? `<header class="home-bar">
          <button class="icon-btn" data-action="menu" aria-label="Menu">${ICON.menu}</button>
          <button class="area-btn" data-action="menu" aria-haspopup="menu">${esc(ASSIGNED_AREA)}${ICON.caret}</button>
        </header>
        <div class="body body-home" id="screen-body">${view.body}</div>`
      : `<header class="app-bar">
          <button class="back-btn" data-action="back">${ICON.back}Back</button>
          <button class="help-btn" data-action="help" aria-haspopup="dialog">Help${ICON.help}</button>
        </header>
        <div class="body body-${state.route}" id="screen-body">${view.tag ? tag(view.tag) : ""}${withDescription(view.body)}</div>`;
    $phone.innerHTML = `
      <div class="status-bar" aria-hidden="true"></div>
      ${chrome}
      ${view.footer ? `<footer class="footer">${view.footer}</footer>` : ""}
      ${view.overlay || ""}
      <div class="sheet-backdrop" id="help-sheet" hidden>
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div class="sheet-handle" aria-hidden="true"></div>
          <h2 id="help-title"></h2>
          <p id="help-desc"></p>
          <button class="btn btn-primary" data-action="close-help">Got it</button>
        </div>
      </div>
      <div class="toast" id="toast" role="status" hidden></div>`;
    document.title = `${screenName(state.route, state.kind)} – AEFI`;
    if (focusTitle) document.getElementById("page-title")?.focus({ preventScroll: true });
    if (state.route === "search" && !store.recent[state.kind].length) {
      // First-time user: land straight in the search box.
      document.getElementById("search-input")?.focus();
    }
  }

  // Page description (from the APK screen list) sits directly under the page title.
  function withDescription(body) {
    if (["success", "aefiSuccess", "aefiSummary", "manageStock", "aefiStockSuccess", "stockSuccess", "receiptScan"].includes(state.route)) return body;   // description lives inside the success panel
    const desc = `<p class="page-desc" id="page-desc">${esc(SCREENS[state.route].desc(state.kind))}</p>`;
    return body.replace("</h1>", `</h1>${desc}`);
  }

  function go(route, { replace = false } = {}) {
    if (!replace) state.history.push(state.route);
    state.route = route;
    state.errors = {};
    render();
    document.getElementById("screen-body").scrollTop = 0;
  }

  function back() {
    if (!state.history.length) return toast("You’re on the first screen of this flow.");
    state.route = state.history.pop();
    state.errors = {};
    render();
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  let helpReturnFocus = null;
  function openHelp() {
    const s = SCREENS[state.route];
    document.getElementById("help-title").textContent = screenName(state.route, state.kind);
    document.getElementById("help-desc").textContent = s.desc(state.kind);
    helpReturnFocus = document.activeElement;
    document.getElementById("help-sheet").hidden = false;
    document.querySelector('[data-action="close-help"]').focus();
  }
  function closeHelp() {
    document.getElementById("help-sheet").hidden = true;
    helpReturnFocus?.focus();
  }

  // ---------- Validation ----------
  function showErrors(errors) {
    state.errors = errors;
    for (const [id, msg] of Object.entries(errors)) {
      const err = document.getElementById(`${id}-err`);
      if (err) { err.hidden = !msg; err.querySelector("span").textContent = msg || ""; }
      const input = document.getElementById(id);
      if (input) { input.classList.toggle("invalid", !!msg); input.setAttribute("aria-invalid", String(!!msg)); }
      document.getElementById(`${id}-group`)?.classList.toggle("has-error", !!msg);
      document.querySelectorAll(`#${id}-group .input`).forEach(el => { el.classList.toggle("invalid", !!msg); el.setAttribute("aria-invalid", String(!!msg)); });
    }
    const first = Object.keys(errors).find(id => errors[id]);
    if (first) {
      (document.getElementById(first) || document.querySelector(`#${first}-group input`))?.focus();
      return false;
    }
    return true;
  }

  // ---------- Manage Stock helpers ----------
  const qtyError = (v = "", max, maxMsg) => !v.trim() ? "Enter the quantity"
    : !isWholeAtLeastOne(v) ? "Enter a whole number of 1 or more"
    : max != null && Number(v) > max ? maxMsg : "";
  const discrepancyError = (v = "", expected) => !v.trim() ? "Enter the quantity received"
    : !/^\d+$/.test(v.trim()) ? "Enter a whole number"
    : Number(v) === expected ? "Received quantity must be greater or less than the expected quantity to report a discrepancy." : "";
  // Partially Received: what arrived must be less than what was expected.
  const partialError = (v = "", expected) => !v.trim() ? "Enter the quantity received"
    : !/^\d+$/.test(v.trim()) ? "Enter a whole number"
    : Number(v) >= expected ? `Quantity received must be less than the expected quantity (${expected}).` : "";
  const stockFormRecord = () => {
    const f = state.sf;
    return { from: CURRENT_FACILITY, to: f.to, resources: f.picked.map(n => ({ resource: n, quantity: f.qty[n] })), vehicle: f.vehicle, how: f.how };
  };
  function applyReceipt(status, received) {
    const t = rcTxn(), r = rcRes();
    Object.assign(r, { status, received: status === "confirmed" ? r.quantity : received });
    t.status = deriveStatus(t.resources);
    back();   // back to Receive Stock
  }
  function finishStock(record) {
    (store.stockRecords || (store.stockRecords = [])).unshift({ type: state.sf.flow, ...record, area: ASSIGNED_AREA, recordedAt: new Date().toISOString() });
    save();
    state.history = ["home", "manageStock"];   // Back from the success screen returns to Manage Stock
    go("stockSuccess", { replace: true });
  }
  // Re-render in place when a choice adds or removes fields, keeping the scroll position and focus.
  function rerender(focusSelector) {
    const top = document.getElementById("screen-body").scrollTop;
    render({ focusTitle: false });
    document.getElementById("screen-body").scrollTop = top;
    if (focusSelector) document.querySelector(focusSelector)?.focus();
  }

  // ---------- Actions ----------
  const ACTIONS = {
    back,
    help: openHelp,
    "close-help": closeHelp,

    "outside-household"() { go("select"); },
    enumeration() { toast("Enumeration and Vaccination isn\u2019t part of this prototype."); },
    "not-in-prototype"(btn) { toast(`${btn.dataset.label} isn\u2019t part of this prototype.`); },
    "report-aefi"() {
      state.history = [];
      state.route = "home";
      go("aefiOverview");
    },
    "aefi-start"() {
      state.aefi = freshAefi();
      state.child = { name: "", dob: "", years: "", months: "", gender: "" };
      go("aefiChild");
    },
    "aefi-child-continue"() {
      const c = state.child;
      const ok = showErrors({
        "child-name": c.name.trim() ? "" : "Enter the child’s name",
        "child-age": ageError(c),
        "child-gender": c.gender ? "" : "Select the child’s gender"
      });
      if (ok) state.fromSummary ? back() : go("aefiDetails");
    },
    "aefi-submit"() {
      const a = state.aefi, today = isoDate(new Date());
      const ok = showErrors({
        "aefi-vaccine": a.vaccine ? "" : "Select the vaccine administered",
        "aefi-vax-date": !a.vaxDate ? "Enter the date of vaccination"
          : a.vaxDate > today ? "Date of vaccination can’t be in the future" : "",
        "aefi-onset-date": !a.onsetDate ? "Enter the date of AEFI onset"
          : a.onsetDate > today ? "Date of AEFI onset can’t be in the future"
          : a.vaxDate && a.onsetDate < a.vaxDate ? "Onset can’t be before the date of vaccination" : "",
        "aefi-type": a.type ? "" : "Select the AEFI type",
        "aefi-desc": a.desc.trim() ? "" : "Enter a description of the event"
      });
      if (ok) state.fromSummary ? back() : go("aefiKit");
    },
    "aefi-kit-continue"() {
      const ok = showErrors({
        "aefi-form-used": state.aefi.formUsed ? "" : "Select Yes or No",
        "aefi-kit-used": state.aefi.kitUsed ? "" : "Select Yes or No"
      });
      if (ok) state.fromSummary ? back() : go("aefiSummary");
    },
    "aefi-edit"(btn) {
      state.fromSummary = true;
      go(btn.dataset.page);
    },
    "aefi-confirm"() {
      const a = state.aefi;
      (store.aefiReports || (store.aefiReports = [])).unshift({ child: { ...state.child }, ...a, reportedAt: new Date().toISOString() });
      store.aefiStats[a.type === "Serious" ? "serious" : "minor"]++;
      save();
      state.history = ["home", "aefiOverview"];   // Back from AEFI Case Reported returns to the overview
      go("aefiSuccess", { replace: true });
    },
    "aefi-another"() {
      state.history.pop();
      state.route = "aefiOverview";
      ACTIONS["aefi-start"]();
    },
    "manage-stock"() {
      state.history = [];
      state.route = "home";
      go("manageStock");
    },
    "aefi-stock-overview"() { go("aefiStockOverview"); },
    "aefi-stock"() {
      state.stock = freshStock();
      // Record Again replaces the success screen, so Back still returns to the overview.
      go("aefiStock", { replace: state.route === "aefiStockSuccess" });
    },
    "aefi-stock-submit"() {
      const s = state.stock;
      const ok = showErrors(Object.fromEntries(STOCK_QUESTIONS.flatMap(q => [
        [q.id, s[q.key] || !askedStock(q, s) ? "" : "Select Yes or No"],
        // Quantities are optional; when given they must be a whole number.
        [`${q.id}-qty`, s[q.key] !== "Yes" || !s[`${q.key}Qty`].trim() || isWholeAtLeastOne(s[`${q.key}Qty`]) ? "" : "Enter a whole number of 1 or more"]
      ])));
      if (!ok) return;
      (store.aefiStock || (store.aefiStock = [])).unshift({ ...s, area: ASSIGNED_AREA, recordedAt: new Date().toISOString() });
      save();
      go("aefiStockSuccess", { replace: true });
    },
    // ---------- Manage Stock flows ----------
    "sf-open"(btn) {
      state.sf = freshSf(btn.dataset.flow);
      if (btn.dataset.flow === "receipt") { state.rc = state.rc || freshRc(); state.rc.tab = "pending"; }
      go(SF().start);
    },
    "sf-txn"(btn) {
      const flow = state.sf.flow;
      state.sf = { ...freshSf(flow), txnId: btn.dataset.id };
      const names = Object.keys(sfTxn().items);
      // A single-resource transaction skips the resource step.
      if (names.length === 1) { state.sf.picked = names; return go(SF().detail); }
      go("stockPick");
    },
    "rc-tab"(btn) {
      state.rc.tab = btn.dataset.tab;
      rerender(`[data-tab="${btn.dataset.tab}"]`);
    },
    "rc-sort-open"() {
      Object.assign(state.rc, { draft: state.rc.sort, sortOpen: true });
      rerender('input[name="sf-sort"]:checked');
    },
    "rc-sort-clear"() {
      state.rc.draft = "newest";
      rerender('input[name="sf-sort"]:checked');
    },
    "rc-sort-apply"() {
      Object.assign(state.rc, { sort: state.rc.draft, sortOpen: false });
      rerender(".rc-sort");
    },
    "rc-open"(btn) {
      const rc = state.rc;
      rc.txnId = btn.dataset.id;
      rc.wasPending = rcTxn().resources.some(r => r.status === "pending");
      go("stockReceipt");
    },
    "rc-confirm"(btn) {
      Object.assign(state.rc, { resIdx: Number(btn.dataset.r), scans: 0, scanned: false, mismatch: false });
      go("receiptConfirm");
    },
    "rc-report"(btn) {
      Object.assign(state.rc, { resIdx: Number(btn.dataset.r), rcv: "", reason: "", other: "", comment: "", qr: false });
      go("receiptReport");
    },
    "rc-scan-open"() {
      state.rc.scanned = false;
      go("receiptScan");
    },
    "rc-scan"() { state.rc.scanned = true; rerender('[data-action="rc-scan-add"]'); },
    "rc-rescan"() { state.rc.scanned = false; rerender('[data-action="rc-scan"]'); },
    "rc-scan-add"() { state.rc.scans++; back(); },
    "rc-confirm-submit"() {
      // As in the inventory app: after scanning, confirm through the quantity-mismatch check.
      if (!state.rc.scans) return applyReceipt("confirmed");
      state.rc.mismatch = true;
      rerender('[data-action="rc-mismatch-confirm"]');
    },
    "rc-mismatch-confirm"() { state.rc.mismatch = false; applyReceipt("confirmed"); },
    "rc-mismatch-back"() { state.rc.mismatch = false; rerender('[data-action="rc-confirm-submit"]'); },
    "rc-qr"() { state.rc.qr = true; rerender('[data-action="rc-qr"]'); },
    "rc-report-submit"() {
      const rc = state.rc;
      const ok = showErrors({
        "sf-rcv": partialError(rc.rcv, rcRes().quantity),
        "sf-reason": rc.reason ? "" : "Select the reason for the discrepancy",
        "sf-other": rc.reason !== "Other" || rc.other.trim() ? "" : "Enter the reason"
      });
      if (ok) { Object.assign(rcRes(), { reason: rc.reason === "Other" ? rc.other.trim() : rc.reason, comment: rc.comment.trim() }); applyReceipt("discrepancy", Number(rc.rcv)); }
    },
    "rc-submit"() {
      const t = rcTxn();
      const ok = showErrors(Object.fromEntries(t.resources.map((r, i) => [`rc-st-${i}`, r.status === "pending" ? "Confirm the receipt or report a discrepancy" : ""])));
      if (!ok) return;
      state.rc.tab = "received";
      finishStock({ txnId: t.id, resources: t.resources.map(r => ({ ...r })) });
    },
    "sf-form-continue"() {
      const f = state.sf, issue = f.flow === "issue";
      const ok = showErrors({
        "sf-res": f.picked.length ? "" : "Select at least one resource",
        ...Object.fromEntries(f.picked.map(name => {
          const r = STOCK_RESOURCES[resIndex(name)];
          return [`sf-qty-${resIndex(name)}`, qtyError(f.qty[name], issue ? r.available : null, `You can issue a maximum of ${r.available} ${r.unit}.`)];
        })),
        "sf-to": f.to ? "" : `Select who the stock is ${SF().toLabel.toLowerCase()}`,
        "sf-vehicle": f.vehicle ? "" : "Select Yes or No"
      });
      if (!ok) return;
      f.resOpen = false;
      f.vehicle === "Yes" ? go("stockShipment") : finishStock(stockFormRecord());
    },
    "sf-ship-submit"() {
      const f = state.sf;
      const ok = showErrors({
        "sf-waybill": f.waybill.trim() ? "" : "Enter the waybill number",
        "sf-wbcount": !f.wbcount.trim() || /^\d+$/.test(f.wbcount.trim()) ? "" : "Enter a whole number",
        "sf-transport": f.transport ? "" : "Select the type of transport"
      });
      if (ok) finishStock({ ...stockFormRecord(), waybill: f.waybill, wbcount: f.wbcount, transport: f.transport, transportid: f.transportid, comments: f.comments });
    },
    "sf-res-open"() {
      state.sf.resOpen = !state.sf.resOpen;
      rerender("#sf-res");
    },
    "sf-res-remove"(btn) {
      const name = STOCK_RESOURCES[btn.dataset.i].name, f = state.sf;
      f.picked = f.picked.filter(n => n !== name);
      delete f.qty[name];
      rerender("#sf-res");
    },
    "sf-res-clear"() {
      Object.assign(state.sf, { picked: [], qty: {} });
      rerender("#sf-res");
    },
    "sf-pick-continue"() {
      if (showErrors({ "sf-res": state.sf.picked.length ? "" : "Select at least one resource" })) go(SF().detail);
    },
    "sf-disc-submit"() {
      const f = state.sf, t = sfTxn();
      const ok = showErrors(Object.fromEntries(f.picked.flatMap(name => [
        [`sf-actual-${resIndex(name)}`, discrepancyError(f.actual[name], t.items[name])],
        isOver(f.actual[name], t.items[name])
          ? [`sf-why-${resIndex(name)}`, (f.why[name] || "").trim() ? "" : "Enter the reason for the discrepancy"]
          : [`sf-reason-${resIndex(name)}`, f.reason[name] ? "" : "Select the reason for the discrepancy"],
        [`sf-other-${resIndex(name)}`, isOver(f.actual[name], t.items[name]) || f.reason[name] !== "Other" || (f.other[name] || "").trim() ? "" : "Enter the reason"]
      ])));
      if (ok) finishStock({ txnId: t.id, discrepancies: f.picked.map(n => ({ resource: n, expected: t.items[n], received: f.actual[n],
        reason: isOver(f.actual[n], t.items[n]) ? f.why[n].trim() : f.reason[n] === "Other" ? f.other[n].trim() : f.reason[n] })) });
    },
    "sf-again"() {
      state.sf = freshSf(state.sf.flow);
      if (state.rc) state.rc.tab = "pending";
      state.history = ["home", "manageStock"];
      go(SF().start, { replace: true });
    },
    "go-home"() {
      state.history = [];
      state.route = "home";
      render();
    },
    "to-aefi-overview"() {
      state.history.pop();
      go("aefiOverview", { replace: true });
    },
    "to-home"() {
      state.history = [];
      go("home", { replace: true });
    },
    menu() { toast("Menu isn\u2019t part of this prototype."); },

    "pick-kind"(btn) {
      state.kind = btn.dataset.kind;
      state.query = "";
      go("search");
    },

    "pick-location"(btn) {
      state.locationId = btn.dataset.id;
      state.query = "";
      markRecent(state.kind, state.locationId);
      go("overview");
    },
    create() {
      state.setup = { name: state.query.trim(), type: "", locality: "" };
      go("setup");
    },
    "setup-continue"() {
      const s = state.setup, k = K();
      const ok = showErrors({
        "setup-name": s.name.trim() ? "" : `Enter the ${k.field} name`,
        "setup-type": s.type ? "" : `Select the ${k.field} type`,
        "setup-locality": s.locality ? "" : `Select the ${k.field} area`
      });
      if (!ok) return;
      const id = `${state.kind}-new-${Date.now()}`;
      store.created[state.kind].unshift({ id, name: s.name.trim(), type: s.type, locality: s.locality, km: 0 });
      statsFor(id);
      markRecent(state.kind, id);
      state.locationId = id;
      state.query = "";
      go("overview", { replace: true });   // replaces Setup, so Back returns to Search
      toast(`${k.short} created`);
    },

    vaccinate() {
      state.child = { name: "", dob: "", years: "", months: "", gender: "" };
      go("child");
    },
    "child-continue"() {
      const c = state.child;
      const ok = showErrors({
        "child-name": c.name.trim() ? "" : "Enter the child’s name",
        "child-age": ageError(c),
        "child-gender": c.gender ? "" : "Select the child’s gender"
      });
      if (ok) go("checklist");
    },
    "submit-checklist"() {
      statsFor(state.locationId)[state.child.gender === "Female" ? "female" : "male"]++;
      store.progress.completed++;
      save();
      state.history = state.history.filter(r => r !== "child" && r !== "checklist");
      go("success", { replace: true });
    },
    "next-child"() {
      state.history.pop();
      state.route = "overview";
      ACTIONS.vaccinate();
    },
    "to-overview"() {
      state.history.pop();
      go("overview", { replace: true });
    }
  };

  $phone.addEventListener("click", e => {
    const btn = e.target.closest("[data-action]");
    if (state.sf?.resOpen && !e.target.closest(".ms")) { state.sf.resOpen = false; rerender(); }
    if (btn && !btn.disabled) ACTIONS[btn.dataset.action]?.(btn);
    else if (e.target.id === "help-sheet") closeHelp();
    else if (e.target.classList.contains("sort-backdrop")) { state.rc.sortOpen = false; rerender(".rc-sort"); }
  });

  // Form fields write straight into state; re-rendering is avoided so focus is kept.
  const FIELD_MAP = {
    ...Object.fromEntries(STOCK_QUESTIONS.flatMap(q => [
      [q.id, v => (state.stock[q.key] = v)],
      [`${q.id}-qty`, v => (state.stock[`${q.key}Qty`] = v)]
    ])),
    "setup-name": v => (state.setup.name = v),
    "setup-type": v => (state.setup.type = v),
    "setup-locality": v => (state.setup.locality = v),
    "child-name": v => (state.child.name = v),
    "child-dob": v => (state.child.dob = v),
    "child-years": v => (state.child.years = v),
    "child-months": v => (state.child.months = v),
    "child-gender": v => (state.child.gender = v),
    "aefi-vaccine": v => (state.aefi.vaccine = v),
    "aefi-vax-date": v => (state.aefi.vaxDate = v),
    "aefi-onset-date": v => (state.aefi.onsetDate = v),
    "aefi-type": v => (state.aefi.type = v),
    "aefi-desc": v => (state.aefi.desc = v),
    "aefi-form-used": v => (state.aefi.formUsed = v),
    "aefi-kit-used": v => (state.aefi.kitUsed = v),
  };

  function clearError(id) {
    if (!state.errors[id]) return;
    const others = state.errors;
    showErrors({ [id]: "" });
    state.errors = { ...others, [id]: "" };   // keep the other fields' errors so they can still clear
  }

  // Manage Stock fields: per-resource ids end in the resource's index (sf-qty-1 → AEFI forms).
  function stockInput(t, key) {
    const f = state.sf;
    // Stock Receipt: search, sort choice, and the Report Discrepancy fields.
    if (key === "sf-search") {
      state.rc.search = t.value;
      document.getElementById("rc-list").innerHTML = receiptListHtml();
      return;
    }
    if (key === "sf-sort") { state.rc.draft = t.value; return; }
    if (key === "sf-rcv" || key === "sf-reason" || key === "sf-other" || key === "sf-comment") {
      state.rc[key.slice(3)] = t.value;
      if (key === "sf-reason") document.getElementById("sf-other-wrap").hidden = t.value !== "Other";
      if (key === "sf-rcv") document.getElementById("sf-diff").innerHTML = diffTag(t.value, rcRes().quantity, resUnit(rcRes().name));
      clearError(key);
      return;
    }
    if (key === "sf-res") {
      f.picked = t.checked ? [...f.picked, t.value] : f.picked.filter(n => n !== t.value);
      if (!t.checked) delete f.qty[t.value];
      clearError("sf-res");
      // Issue / Return: a picked resource adds its quantity card; the dropdown stays open.
      if (state.route === "stockForm") rerender(`input[name="sf-res"][value="${CSS.escape(t.value)}"]`);
      return;
    }
    const m = key.match(/^sf-(qty|reason|other|why|actual)-(\d+)$/);
    if (m) {
      const r = STOCK_RESOURCES[m[2]];
      f[m[1]][r.name] = t.value;
      if (m[1] === "reason") document.getElementById(`sf-other-${m[2]}-wrap`).hidden = t.value !== "Other";
      if (m[1] === "actual") {
        const t2 = sfTxn(), over = isOver(t.value, t2.items[r.name]);
        document.getElementById(`sf-diff-${m[2]}`).innerHTML = diffTag(t.value, t2.items[r.name], r.unit);
        // More received than expected: swap the damage dropdown for the comment.
        document.getElementById(`sf-reason-${m[2]}-wrap`).hidden = over;
        document.getElementById(`sf-why-${m[2]}-wrap`).hidden = !over;
      }
    } else {
      f[key.slice(3)] = t.value;
    }
    clearError(key);
    if (key === "sf-vehicle") {
      document.getElementById("sf-how-wrap").hidden = t.value !== "No";
      document.getElementById("sf-form-btn").textContent = t.value === "Yes" ? "Continue" : "Submit";
    }
  }

  $phone.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "search-input") {
      state.query = t.value;
      document.getElementById("search-results").innerHTML = searchResultsHtml();
      document.getElementById("create-btn").outerHTML = createBtnHtml();
      return;
    }
    const key = t.type === "radio" || t.type === "checkbox" ? t.name : t.id;
    if (key.startsWith("sf-")) return stockInput(t, key);
    // Child name: capital first letter on each word, keeping the caret where it was.
    if (key === "child-name") {
      const pos = t.selectionStart;
      t.value = t.value.replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase());
      t.setSelectionRange(pos, pos);
    }
    if (FIELD_MAP[key]) { FIELD_MAP[key](t.value); clearError(key); }

    // AEFI forms and kits: Yes opens the quantity; No hides and clears it.
    const stockQ = STOCK_QUESTIONS.find(q => q.id === key);
    if (stockQ) {
      const show = t.value === "Yes";
      document.getElementById(`${key}-wrap`).hidden = !show;
      if (!show) {
        state.stock[`${stockQ.key}Qty`] = "";
        document.getElementById(`${key}-qty`).value = "";
        clearError(`${key}-qty`);
      }
      // Its dependent "used" question sits inside the same container; No clears its answer.
      const dep = STOCK_QUESTIONS.find(q => q.dependsOn === stockQ.key);
      if (dep) {
        if (!show) {
          Object.assign(state.stock, { [dep.key]: "", [`${dep.key}Qty`]: "" });
          document.querySelectorAll(`input[name="${dep.id}"]`).forEach(i => (i.checked = false));
          document.getElementById(`${dep.id}-wrap`).hidden = true;
          document.getElementById(`${dep.id}-qty`).value = "";
          clearError(dep.id);
          clearError(`${dep.id}-qty`);
        }
      }
    }

    if (key === "aefi-vax-date" || key === "aefi-onset-date") t.classList.toggle("is-empty", !t.value);
    if (key === "aefi-vax-date") document.getElementById("aefi-onset-date").min = t.value;

    if (key === "child-dob") {
      const a = t.value ? ageFromDob(t.value) : { years: "", months: "" };
      if (a) {
        Object.assign(state.child, a);
        document.getElementById("child-years").value = a.years;
        document.getElementById("child-months").value = a.months;
      }
      t.classList.toggle("is-empty", !t.value);
    }
    if (key === "child-years" || key === "child-months") {
      t.value = t.value.replace(/\D/g, "").slice(0, 2);
      FIELD_MAP[key](t.value);
      const c = state.child, dobEl = document.getElementById("child-dob");
      c.dob = c.years || c.months ? dobFromAge(c.years, c.months) : "";
      dobEl.value = c.dob;
      dobEl.classList.toggle("is-empty", !c.dob);
    }
    if (["child-dob", "child-years", "child-months"].includes(key)) clearError("child-age");

    if (key === "setup-locality") document.querySelector(".tag span").textContent = t.value || ASSIGNED_AREA;
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !document.getElementById("help-sheet")?.hidden) closeHelp();
  });

  render({ focusTitle: false });

})();
