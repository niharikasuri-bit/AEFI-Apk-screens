/* AEFI – Adverse Event Following Immunization (mobile prototype)
 *
 * Home → Report AEFI → AEFI Cases Overview → Child Details → AEFI Details
 *      → AEFI Checklist → Summary → AEFI Reported
 *
 * The polio Outside Household screens below are kept from the polio-app copy.
 *
 * Flow: Select Vaccination Location → Search (Transit Post | CLF)
 *       → [Setup if not found] → Overview → Child Details
 *       → Vaccination Checklist → Vaccination Successful
 *
 * Transit Post and CLF share every screen; KINDS holds the wording that differs.
 * Recents, created locations and today's counts persist in localStorage so a
 * second visit behaves like a returning user.
 */
(function () {
  "use strict";

  // ---------- Config ----------
  const KINDS = {
    tp: {
      short: "Transit Post",
      lower: "transit post",
      described: "transit post",
      nameLabel: "Transit post name",
      areaLabel: "Transit post area",
      typeLabel: "Transit post type",
      optionSub: "Transit locations such as bus stations and border points.",
      types: ["Bus stand", "Railway station", "Market", "Border crossing", "Toll plaza", "Ferry terminal"]
    },
    clf: {
      short: "CLF",
      lower: "CLF",
      described: "Communal Living Facility (CLF)",
      nameLabel: "CLF name",
      areaLabel: "CLF area",
      typeLabel: "CLF type",
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
  const VACCINES = ["OPV (Oral Polio)", "IPV (Inactivated Polio)", "Measles-Rubella", "Pentavalent", "BCG", "Rotavirus"];
  const AEFI_TYPES = ["Non-serious", "Serious"];
  // AEFI Checklist — Yes/No form and kit indicators asked after AEFI Details.
  const KIT_QUESTIONS = [
    { id: "kit-form-available", key: "formAvailable", label: "Is an AEFI form available?" },
    { id: "kit-form-used", key: "formUsed", label: "Has an AEFI form been used?" },
    { id: "kit-kit-available", key: "kitAvailable", label: "Is an AEFI kit (adrenaline) available?" },
    { id: "kit-kit-used", key: "kitUsed", label: "Has an AEFI kit (adrenaline) been used?" }
  ];

  const SCREENS = {
    home:      { name: "Home", desc: () => "" },
    select:    { name: "Select Vaccination Location", desc: () => "Select the location where you plan to vaccinate children outside households." },
    search:    { name: k => `Search ${KINDS[k].short}`, desc: k => `Search for the ${KINDS[k].described} where you are vaccinating children.` },
    setup:     { name: k => `${KINDS[k].short} Setup`, desc: k => `Add details for the ${KINDS[k].described} where vaccination will take place.` },
    overview:  { name: k => `${KINDS[k].short} Overview`, desc: k => `Vaccinate children at the ${KINDS[k].lower} and track your progress.` },
    child:     { name: "Child Details", desc: () => "Add details of the child you are vaccinating." },
    checklist: { name: "Vaccination Checklist", desc: () => "Confirm the vaccination by completing the required checklist." },
    success:   { name: "Vaccination Successful", desc: () => "Vaccination has been recorded successfully." },
    aefiOverview: { name: "AEFI Cases Overview", desc: () => "Report adverse events following immunization and track reported cases." },
    aefiChild:   { name: "Child Details", desc: () => "Add details of the child who had the adverse event." },
    aefiDetails: { name: "AEFI Details", desc: () => "Record the vaccine given and the adverse event that followed." },
    aefiKits:    { name: "AEFI Checklist", desc: () => "Confirm whether an AEFI form and an AEFI kit (adrenaline) were available and used for this case." },
    aefiSummary: { name: "Summary", desc: () => "Check the details before you submit the report." },
    aefiSuccess: { name: "AEFI Reported", desc: () => "The adverse event has been reported successfully." }
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
  const freshAefi = () => ({ vaccine: "", vaxDate: "", onsetDate: "", type: "", desc: "",
    formAvailable: "", formUsed: "", kitAvailable: "", kitUsed: "" });
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
    outside: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.17 9.17c0-3.91-3.19-7.06-7.11-7-3.83.06-6.99 3.37-6.88 7.19.09 3.38 2.58 6.16 5.83 6.7V20H6v-3h1v-4c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v4h1v5h16v-2h-3v-3.88c3.47-.41 6.17-3.36 6.17-6.95zM4.5 11c.83 0 1.5-.67 1.5-1.5S5.33 8 4.5 8 3 8.67 3 9.5 3.67 11 4.5 11z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    aefi: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM12 17.3c-.72 0-1.3-.58-1.3-1.3s.58-1.3 1.3-1.3 1.3.58 1.3 1.3-.58 1.3-1.3 1.3zm1-4.3h-2V7h2v6z"/></svg>',
    closedHouse: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 3 2 12h3v8h14v-8h3L12 3zm-2.5 10.5v-1a2.5 2.5 0 0 1 5 0v1h.5V18H9v-4.5h.5zm1.5 0h2v-1a1 1 0 0 0-2 0v1z"/></svg>',
    stock: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z"/></svg>',
    complaint: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/></svg>',
    sync: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 12l4-4-4-4v3H3v2h15v3zM6 12l-4 4 4 4v-3h15v-2H6v-3z"/></svg>',
    beneficiary: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm4.5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM4.5 16h8v-.75c0-1.35-2.67-2.25-4-2.25s-4 .9-4 2.25V16zm10-6.5V11h5V9.5h-5zm0 3V14h5v-1.5h-5z"/></svg>',
    share: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    book: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/><path fill="currentColor" d="M17.5 10.5c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zm4.5 1.84c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z"/></svg>',
    db: '<svg class="tile-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM2 8v1.5h20V8H2zm6.67 1.5V20H10V9.5H8.67zm5.33 0V20h1.33V9.5H14z"/></svg>',
    bus: '<svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg>',
    groups: '<svg class="option-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>',
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
    error: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.3" r="1" fill="#fff"/></svg>'
  };

  // ---------- Shared components ----------
  const tag = text => `<div class="tag">${ICON.person}<span>${esc(text)}</span></div>`;
  const title = text => `<h1 class="page-title" id="page-title" tabindex="-1">${esc(text)}</h1>`;
  const pairs = rows => `<dl class="pairs">${rows.map(([l, v]) => `<div class="pair"><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  const errorText = (id, msg) => `<p class="field-error" id="${id}-err" ${msg ? "" : "hidden"}>${ICON.error}<span>${esc(msg || "")}</span></p>`;

  function textField({ id, label, value, required, type = "text", help, inputmode, autocomplete = "off" }) {
    const err = state.errors[id];
    const describedBy = [help ? `${id}-help` : "", `${id}-err`].filter(Boolean).join(" ");
    return `<div class="field">
      <label class="field-label" for="${id}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <input class="input ${err ? "invalid" : ""}" id="${id}" name="${id}" type="${type}" value="${esc(value)}" autocomplete="${autocomplete}"
        ${inputmode ? `inputmode="${inputmode}"` : ""} ${required ? 'aria-required="true"' : ""} aria-invalid="${!!err}" aria-describedby="${describedBy}" />
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
            ${soon("stock", "Manage|Stock")}
            ${soon("book", "Stock|Reconciliation")}
            ${tile("report-aefi", "aefi", "Report|AEFI")}
            ${soon("complaint", "File|Complaint")}
            ${soon("sync", "Sync|Data")}
            ${soon("complaint", "View|Reports")}
            ${soon("sync", "Update Stock|Data")}
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
        footer: `<button class="btn btn-primary" data-action="aefi-start">Report AEFI</button>`
      };
    },

    aefiChild() {
      const c = state.child;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Child Details")}
          <div class="card">
            ${textField({ id: "child-name", label: "Child name", value: c.name, required: true })}
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
        body: `${title("AEFI Details")}
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

    aefiKits() {
      const a = state.aefi;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("AEFI Checklist")}
          <div class="card">
            ${KIT_QUESTIONS.map(q => radioGroup({ id: q.id, legend: q.label, value: a[q.key], options: ["Yes", "No"], required: true })).join("")}
          </div>`,
        footer: `<button class="btn btn-primary" data-action="aefi-kits-continue">Continue</button>`
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
          ${section("AEFI Details", "aefiDetails", [
            ["Vaccine administered", a.vaccine],
            ["Date of vaccination", shortDate(a.vaxDate)],
            ["Date of AEFI onset", shortDate(a.onsetDate)],
            ["AEFI type", a.type],
            ["Description", a.desc.trim()]
          ])}
          ${section("AEFI Checklist", "aefiKits", KIT_QUESTIONS.map(q => [q.label, a[q.key]]))}`,
        footer: `<button class="btn btn-primary" data-action="aefi-confirm">Submit</button>`
      };
    },

    aefiSuccess() {
      return {
        tag: ASSIGNED_AREA,
        body: `<div class="card panel-card">
            <div class="success-panel" role="status">
              ${ICON.check}
              <h1 class="success-title" id="page-title" tabindex="-1">AEFI Reported</h1>
            </div>
            <p class="success-desc">${esc(SCREENS.aefiSuccess.desc())}</p>
            <div class="panel-actions">
              <button class="btn btn-primary" data-action="aefi-another">Report Another AEFI</button>
              <button class="btn btn-secondary" data-action="to-aefi-overview">Back to Overview</button>
            </div>
          </div>`,
        footer: ""
      };
    },

    select() {
      // Whole card is the tap target and goes straight to that location type's search.
      const opt = (kind, label) => `<li><button class="option-card" data-action="pick-kind" data-kind="${kind}">
          ${ICON[kind === "tp" ? "bus" : "groups"]}
          <span class="option-main"><span class="option-title">${esc(label)}</span><span class="option-sub">${esc(KINDS[kind].optionSub)}</span></span>
        </button></li>`;
      return {
        tag: ASSIGNED_AREA,
        body: `${title("Select Vaccination Location")}
          <ul class="option-list" aria-labelledby="page-title">
            ${opt("tp", "Transit Post")}
            ${opt("clf", "Communal Living Facility (CLF)")}
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
      <button class="btn btn-secondary loc-select" data-action="pick-location" data-id="${esc(l.id)}" aria-describedby="loc-${esc(l.id)}">Select ${esc(k.short)}</button>
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
    return `<button class="btn btn-primary" id="create-btn" data-action="create" ${noMatch() ? "" : "disabled"}>${ICON.add}Create ${esc(K().short)}</button>`;
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
    if (["success", "aefiSuccess", "aefiSummary"].includes(state.route)) return body;   // description lives inside the success panel
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
      if (ok) state.fromSummary ? back() : go("aefiKits");
    },
    "aefi-kits-continue"() {
      const a = state.aefi;
      const ok = showErrors(Object.fromEntries(KIT_QUESTIONS.map(q => [q.id, a[q.key] ? "" : "Select Yes or No"])));
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
      state.history = ["home", "aefiOverview"];   // Back from AEFI Reported returns to the overview
      go("aefiSuccess", { replace: true });
    },
    "aefi-another"() {
      state.history.pop();
      state.route = "aefiOverview";
      ACTIONS["aefi-start"]();
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
        "setup-name": s.name.trim() ? "" : `Enter the ${k.lower} name`,
        "setup-type": s.type ? "" : `Select the ${k.lower} type`,
        "setup-locality": s.locality ? "" : `Select the ${k.lower} area`
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
    if (btn && !btn.disabled) ACTIONS[btn.dataset.action]?.(btn);
    else if (e.target.id === "help-sheet") closeHelp();
  });

  // Form fields write straight into state; re-rendering is avoided so focus is kept.
  const FIELD_MAP = {
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
    ...Object.fromEntries(KIT_QUESTIONS.map(q => [q.id, v => (state.aefi[q.key] = v)])),
  };

  function clearError(id) {
    if (!state.errors[id]) return;
    showErrors({ [id]: "" });
  }

  $phone.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "search-input") {
      state.query = t.value;
      document.getElementById("search-results").innerHTML = searchResultsHtml();
      document.getElementById("create-btn").outerHTML = createBtnHtml();
      return;
    }
    const key = t.type === "radio" ? t.name : t.id;
    if (FIELD_MAP[key]) { FIELD_MAP[key](t.value); clearError(key); }

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
