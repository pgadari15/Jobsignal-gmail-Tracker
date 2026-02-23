// ============================================================
//  JOBSIGNAL v2 — Gmail Job Application Tracker
//  Upgraded from Priyanka's original script
//
//  WHAT'S NEW vs v1:
//  ✅ Keeps your existing logic (detectStage, detectCompany, etc.)
//  ✅ Smarter company extraction (handles ATS platforms like Greenhouse)
//  ✅ Better role parsing — less garbage matches
//  ✅ More stage patterns (Screening, Advancing, Phone Screen, etc.)
//  ✅ Priority flagging per row (HIGH / MEDIUM / LOW)
//  ✅ AI-recommended action per application
//  ✅ Rich HTML daily summary email (not plain text)
//  ✅ Auto Dashboard tab with live KPIs
//  ✅ Looks back 365 days on first run, then 7 days daily
//  ✅ Custom menu in Google Sheets UI
//  ✅ One-click trigger setup
//  ✅ Sheet found by name (not hardcoded ID — won't break)
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const CONFIG = {
  sheetName: "Job Tracker",       // Name of your Google Sheet
  tabApplications: "Applications",
  tabDashboard:    "Dashboard",
  tabLog:          "Agent Log",
  lookbackDays:    365,           // Full history on first run
  dailyLookback:   7,             // Days to scan on daily triggers
  maxThreads:      200,           // Gmail thread limit per run

  // ATS platforms — extract company from subject/body instead of email domain
  atsDomains: [
    "greenhouse.io", "lever.co", "workday.com", "myworkdayjobs.com",
    "icims.com", "taleo.net", "jobvite.com", "smartrecruiters.com",
    "successfactors.com", "brassring.com", "bamboohr.com", "ashbyhq.com",
    "rippling.com", "recruitee.com", "dover.com", "jazz.co"
  ],

  // Email providers to ignore when extracting company from domain
  genericDomains: [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "me.com", "aol.com", "protonmail.com"
  ]
};

// ── MAIN ENTRY POINT ─────────────────────────────────────────
function runJobTracker(isFullSync) {
  const ss   = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, CONFIG.tabApplications);

  // Write headers if sheet is empty
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Message ID", "Date", "Company", "Role", "Stage",
      "Priority", "Action", "Source", "Subject", "From", "Link", "Confidence"
    ];
    sheet.appendRow(headers);
    styleHeaders(sheet, headers.length);
  }

  // Load existing IDs to prevent duplicates
  const lastRow = sheet.getLastRow();
  const existingIds = new Set(
    lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().filter(String)
      : []
  );

  // Build search query — strict phrases only, blocks ads/newsletters
  const days = isFullSync ? CONFIG.lookbackDays : CONFIG.dailyLookback;
  const query = [
    `newer_than:${days}d`,
    `(`,
    `"thank you for applying" OR`,
    `"we received your application" OR`,
    `"application confirmation" OR`,
    `"your application to" OR`,
    `"your application for" OR`,
    `"we'd like to schedule" OR`,
    `"interview invitation" OR`,
    `"schedule an interview" OR`,
    `"offer letter" OR`,
    `"pleased to offer" OR`,
    `"we regret to inform" OR`,
    `"not selected for" OR`,
    `"moved forward with other candidates" OR`,
    `"background check" OR`,
    `"reference check"`,
    `)`,
    `-category:promotions`,
    `-category:social`,
    `-unsubscribe`,
    `-"view in browser"`,
    `-"click here to unsubscribe"`
  ].join(" ");

  const threads = GmailApp.search(query, 0, CONFIG.maxThreads);
  logToSheet(ss, `🔄 Sync started`, `${threads.length} threads · lookback: ${days}d`);

  let newRows  = [];
  let todayItems = [];

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const id = msg.getId();
      if (existingIds.has(id)) continue;

      const from    = msg.getFrom();
      const subject = msg.getSubject() || "";
      const date    = msg.getDate();
      const body    = msg.getPlainBody() || "";
      const link    = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
      const combined = subject + " " + body;

      // Skip ads, newsletters, and non-job emails
      if (!isJobEmail(from, subject, body)) continue;

      const stage      = detectStage(combined);
      const company    = detectCompany(from, subject, body);
      const role       = detectRole(subject, body);
      const source     = detectSource(from, body);
      const confidence = scoreConfidence(company, role, stage);
      const priority   = assignPriority(stage);
      const action     = recommendAction(stage, company);

      newRows.push([
        id,
        Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy"),
        company, role, stage, priority, action,
        source, subject, from, link, confidence
      ]);

      existingIds.add(id);

      if (isToday(date)) {
        todayItems.push({ company, role, stage, priority, link });
      }
    }
  }

  // Batch write (much faster than one row at a time)
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length)
         .setValues(newRows);
    applyRowColors(sheet);
  }

  // Refresh dashboard
  updateDashboard(ss);

  // Send daily email summary if new items today
  if (todayItems.length > 0) {
    sendHtmlSummaryEmail(todayItems);
  }

  logToSheet(ss, `✅ Sync complete`, `${newRows.length} new entries added`);
  Logger.log(`Done. ${newRows.length} new rows added.`);
}

// ── FULL SYNC (run once to get all history) ──────────────────
function runFullSync() {
  runJobTracker(true);
  SpreadsheetApp.getUi().alert(`✅ Full sync complete!\n\nCheck your Applications tab.`);
}

// ── DAILY SYNC (used by time trigger) ────────────────────────
function runDailySync() {
  runJobTracker(false);
}

// ── STAGE DETECTION (upgraded) ──────────────────────────────
function detectStage(text) {
  text = text.toLowerCase();

  // Order matters — most specific first
  if (matchAny(text, ["pleased to offer", "offer letter", "we'd like to offer", "job offer", "formal offer", "compensation package"]))
    return "🎉 Offer";

  if (matchAny(text, ["background check", "reference check", "checkr", "sterling", "hireright"]))
    return "🔍 Ref/BG Check";

  if (matchAny(text, ["final round", "final interview", "last round", "executive interview", "panel interview", "case study", "take home assessment", "technical assessment", "hackerrank", "codility"]))
    return "🔥 Final Round";

  if (matchAny(text, ["unfortunately", "not selected", "moved forward with other", "not moving forward", "decided not to", "we regret to", "position has been filled", "will not be moving", "not a match", "other candidates"]))
    return "❌ Rejected";

  if (matchAny(text, ["interview", "schedule a call", "schedule time", "calendly", "zoom link", "google meet", "teams meeting", "we'd like to meet", "speak with you"]))
    return "📅 Interview";

  if (matchAny(text, ["phone screen", "phone call", "introductory call", "recruiter call", "15 minute", "30 minute"]))
    return "📞 Phone Screen";

  if (matchAny(text, ["next steps", "move you forward", "advance your application", "excited to share", "follow up", "we'd like to learn more"]))
    return "⏩ Advancing";

  if (matchAny(text, ["application received", "thank you for applying", "we received your application", "successfully submitted", "application confirmation"]))
    return "✅ Applied";

  if (matchAny(text, ["assessment", "skills test", "questionnaire", "survey"]))
    return "📝 Assessment";

  return "📧 Other";
}

function matchAny(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}

// ── SPAM / AD FILTER ────────────────────────────────────────
// Returns true only if email looks like a real job-related email
function isJobEmail(from, subject, body) {
  const text = (subject + " " + body.substring(0, 500)).toLowerCase();

  // Must contain at least one strong job signal
  const strongSignals = [
    "thank you for applying",
    "we received your application",
    "application confirmation",
    "your application",
    "interview",
    "offer letter",
    "pleased to offer",
    "not selected",
    "we regret",
    "moved forward",
    "background check",
    "reference check",
    "recruiter",
    "hiring manager",
    "job opportunity",
    "position",
    "role at",
    "next steps"
  ];

  const hasSignal = strongSignals.some(s => text.includes(s));
  if (!hasSignal) return false;

  // Reject if it looks like a newsletter or ad
  const spamSignals = [
    "unsubscribe",
    "view in browser",
    "click here to",
    "manage your preferences",
    "email preferences",
    "you're receiving this",
    "marketing",
    "newsletter",
    "promotional",
    "% off",
    "sale ends",
    "limited time",
    "special offer",
    "deal expires",
    "shop now",
    "buy now",
    "free trial",
    "subscribe now"
  ];

  const isSpam = spamSignals.some(s => text.includes(s));
  if (isSpam) return false;

  return true;
}

// ── COMPANY DETECTION (smarter) ──────────────────────────────
function detectCompany(from, subject, body) {
  const emailDomain = (from.match(/@([a-zA-Z0-9.\-]+)/) || [])[1] || "";
  const domainBase  = emailDomain.split(".")[0].toLowerCase();

  // If it's a real company domain (not ATS or generic), use it
  const isAts     = CONFIG.atsDomains.some(d => emailDomain.includes(d));
  const isGeneric = CONFIG.genericDomains.includes(emailDomain);

  if (!isAts && !isGeneric && domainBase.length > 2) {
    return capitalize(domainBase);
  }

  // Try subject line patterns
  const subjectPatterns = [
    /your application (?:to|at|with)\s+([A-Za-z0-9 &,.\-]+?)(?:\s*[-–|!]|\s+for\s|\s+has\s|$)/i,
    /application (?:to|at|with|for)\s+([A-Za-z0-9 &,.\-]+?)(?:\s*[-–|!]|\s+for\s|$)/i,
    /(?:from|at)\s+([A-Z][A-Za-z0-9 &,.\-]{2,40})(?:\s*[-–|]|$)/,
    /([A-Z][A-Za-z0-9 &]{2,30})\s+(?:is|has|would like|wants to)/,
  ];

  for (const p of subjectPatterns) {
    const m = subject.match(p);
    if (m && m[1] && m[1].trim().length > 2) {
      return m[1].trim().replace(/\s+/g, " ");
    }
  }

  // Try body (first 400 chars)
  const bodySnip = body.substring(0, 400);
  const bodyMatch = bodySnip.match(/(?:team at|joining)\s+([A-Z][A-Za-z0-9 &]{2,30})/);
  if (bodyMatch) return bodyMatch[1].trim();

  return "Unknown";
}

// ── ROLE DETECTION (cleaner) ─────────────────────────────────
function detectRole(subject, body) {
  const patterns = [
    // "application for the Senior Data Analyst position"
    /application (?:for|to)\s+(?:the\s+)?(.{5,60}?)(?:\s+(?:position|role|job|opening)|$)/i,
    // "Senior Data Analyst at Phase2"
    /([A-Z][A-Za-z\s\/\-]{4,50}?)\s+(?:at|@)\s+[A-Z]/,
    // "Role: Senior Data Analyst"
    /(?:role|position)[:\- ]+([A-Za-z\s\/\-]{5,60}?)(?:\n|$)/i,
    // "for the Senior Data Analyst role"
    /for\s+(?:the\s+)?([A-Za-z\s\/\-]{5,60}?)(?:\s+role|\s+position)/i,
  ];

  for (const p of patterns) {
    const m = subject.match(p) || body.substring(0, 500).match(p);
    if (m && m[1]) {
      const clean = m[1].trim().replace(/\s+/g, " ");
      if (clean.length > 4 && clean.length < 70) return clean;
    }
  }

  return "";
}

// ── SOURCE DETECTION ─────────────────────────────────────────
function detectSource(from, body) {
  const t = (from + " " + body.substring(0, 300)).toLowerCase();
  if (t.includes("linkedin"))          return "LinkedIn";
  if (t.includes("greenhouse"))        return "Greenhouse";
  if (t.includes("lever"))             return "Lever";
  if (t.includes("workday"))           return "Workday";
  if (t.includes("icims"))             return "iCIMS";
  if (t.includes("jobvite"))           return "Jobvite";
  if (t.includes("smartrecruiters"))   return "SmartRecruiters";
  if (t.includes("indeed"))            return "Indeed";
  if (t.includes("glassdoor"))         return "Glassdoor";
  if (t.includes("ziprecruiter"))      return "ZipRecruiter";
  if (t.includes("ashby"))             return "Ashby";
  return "Direct";
}

// ── CONFIDENCE SCORE ─────────────────────────────────────────
function scoreConfidence(company, role, stage) {
  let score = 0;
  if (company && company !== "Unknown") score += 0.35;
  if (role && role.length > 3)          score += 0.30;
  if (stage && stage !== "📧 Other")    score += 0.35;
  return Math.round(score * 100) / 100;
}

// ── PRIORITY ─────────────────────────────────────────────────
function assignPriority(stage) {
  const high   = ["🎉 Offer", "🔥 Final Round", "🔍 Ref/BG Check", "📅 Interview"];
  const medium = ["📞 Phone Screen", "⏩ Advancing", "📝 Assessment"];
  if (high.some(s => stage.includes(s.split(" ")[1])))   return "🔴 HIGH";
  if (medium.some(s => stage.includes(s.split(" ")[1]))) return "🟡 MEDIUM";
  return "⚪ LOW";
}

// ── AI-RECOMMENDED ACTION ────────────────────────────────────
function recommendAction(stage, company) {
  const co = company && company !== "Unknown" ? company : "them";
  const map = {
    "Offer":      `🎉 Review offer details — negotiate salary/benefits before accepting`,
    "Final":      `📚 Prepare intensively — research ${co} deeply, prep case answers`,
    "Ref/BG":     `📞 Alert your references now — offer is very likely coming`,
    "Interview":  `✉️ Confirm attendance, prep STAR stories, research ${co}`,
    "Phone":      `📋 Prep 60-sec intro, have questions ready for recruiter`,
    "Advancing":  `⚡ Reply promptly to maintain momentum with ${co}`,
    "Assessment": `⏰ Complete assessment ASAP — delays signal low interest`,
    "Applied":    `📅 Wait 7-10 days then send a polite follow-up email`,
    "Rejected":   `📝 Log rejection reason, request feedback if possible`,
    "Other":      `👀 Review email manually to classify`
  };
  for (const [key, val] of Object.entries(map)) {
    if (stage.includes(key)) return val;
  }
  return "Review manually";
}

// ── DASHBOARD ────────────────────────────────────────────────
function updateDashboard(ss) {
  const appSheet  = ss.getSheetByName(CONFIG.tabApplications);
  const dashSheet = getOrCreateSheet(ss, CONFIG.tabDashboard);

  if (!appSheet || appSheet.getLastRow() < 2) return;

  const data = appSheet.getRange(2, 1, appSheet.getLastRow() - 1, 12).getValues()
                       .filter(r => r[0]); // skip empty rows

  // Count stages
  const stageCounts = {};
  let highPriority = 0;

  data.forEach(row => {
    const stage    = row[4] || "Other";
    const priority = row[5] || "";
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    if (priority.includes("HIGH")) highPriority++;
  });

  const total       = data.length;
  const offers      = stageCounts["🎉 Offer"]       || 0;
  const finalRound  = stageCounts["🔥 Final Round"] || 0;
  const interviews  = stageCounts["📅 Interview"]   || 0;
  const phoneScreen = stageCounts["📞 Phone Screen"]|| 0;
  const advancing   = stageCounts["⏩ Advancing"]   || 0;
  const rejected    = stageCounts["❌ Rejected"]    || 0;
  const applied     = stageCounts["✅ Applied"]     || 0;
  const responseRate = total > 0
    ? Math.round(((total - applied - rejected - (stageCounts["📧 Other"] || 0)) / total) * 100)
    : 0;

  dashSheet.clearContents();

  const rows = [
    ["📊 JOBSIGNAL DASHBOARD", ""],
    ["", ""],
    ["📋  Total Tracked",      total],
    ["✅  Applied / Confirmed", applied],
    ["⏩  Advancing",           advancing],
    ["📞  Phone Screen",        phoneScreen],
    ["📅  Interviews",          interviews],
    ["🔥  Final Round",         finalRound],
    ["🔍  Ref / BG Check",      stageCounts["🔍 Ref/BG Check"] || 0],
    ["🎉  Offers",              offers],
    ["❌  Rejected",            rejected],
    ["", ""],
    ["📈  Response Rate",       responseRate + "%"],
    ["🔴  High Priority Items", highPriority],
    ["🕐  Last Synced",         Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")],
  ];

  dashSheet.getRange(1, 1, rows.length, 2).setValues(rows);

  // Styling
  dashSheet.getRange("A1").setFontSize(16).setFontWeight("bold").setFontColor("#4fffb0");
  dashSheet.getRange("A3:A15").setFontWeight("bold");
  dashSheet.getRange("B3:B15").setFontColor("#6c8eff").setFontWeight("bold").setFontSize(13);
  dashSheet.setColumnWidth(1, 240);
  dashSheet.setColumnWidth(2, 140);
  dashSheet.setTabColor("#4fffb0");
}

// ── HTML EMAIL SUMMARY ───────────────────────────────────────
function sendHtmlSummaryEmail(items) {
  const rows = items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2535;">${i.company}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2535;">${i.role || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2535;">${i.stage}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2535;font-weight:bold;color:${i.priority.includes("HIGH") ? "#ff6b6b" : i.priority.includes("MEDIUM") ? "#ffd166" : "#6b7390"}">${i.priority}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e2535;"><a href="${i.link}" style="color:#6c8eff;">View Email</a></td>
    </tr>`).join("");

  const html = `
  <div style="font-family:'DM Sans',Arial,sans-serif;background:#0a0d14;padding:32px;max-width:640px;margin:0 auto;border-radius:16px;">
    <h2 style="color:#4fffb0;font-size:22px;margin:0 0 4px;">📡 JobSignal Daily Summary</h2>
    <p style="color:#6b7390;font-size:13px;margin:0 0 24px;">${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE, MMMM d yyyy")}</p>
    <table style="width:100%;border-collapse:collapse;background:#111520;border-radius:12px;overflow:hidden;">
      <thead>
        <tr style="background:#161c2d;">
          <th style="padding:10px 12px;text-align:left;color:#6b7390;font-size:11px;text-transform:uppercase;">Company</th>
          <th style="padding:10px 12px;text-align:left;color:#6b7390;font-size:11px;text-transform:uppercase;">Role</th>
          <th style="padding:10px 12px;text-align:left;color:#6b7390;font-size:11px;text-transform:uppercase;">Stage</th>
          <th style="padding:10px 12px;text-align:left;color:#6b7390;font-size:11px;text-transform:uppercase;">Priority</th>
          <th style="padding:10px 12px;text-align:left;color:#6b7390;font-size:11px;text-transform:uppercase;">Link</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b7390;font-size:11px;margin-top:20px;">JobSignal Agent · Auto-generated · <a href="https://docs.google.com/spreadsheets" style="color:#4fffb0;">Open Dashboard</a></p>
  </div>`;

  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    `📡 JobSignal: ${items.length} new update${items.length > 1 ? "s" : ""} today`,
    items.map(i => `${i.company} — ${i.role} (${i.stage})`).join("\n"),
    { htmlBody: html }
  );
}

// ── HELPERS ──────────────────────────────────────────────────
function getSpreadsheet() {
  // Find by name first (safer than hardcoded ID)
  const files = DriveApp.getFilesByName(CONFIG.sheetName);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  // Fallback: use active spreadsheet (when running from script editor)
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeaders(sheet, numCols) {
  const hdr = sheet.getRange(1, 1, 1, numCols);
  hdr.setBackground("#0a0d14");
  hdr.setFontColor("#4fffb0");
  hdr.setFontWeight("bold");
  hdr.setFontSize(11);
  sheet.setFrozenRows(1);
}

function applyRowColors(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const stageCol = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
  stageCol.forEach((row, i) => {
    const stage = row[0] || "";
    let color = "#111520";
    if (stage.includes("Offer"))      color = "#0d2b1a";
    if (stage.includes("Final"))      color = "#2b1a0d";
    if (stage.includes("Interview"))  color = "#0d1a2b";
    if (stage.includes("Rejected"))   color = "#2b0d0d";
    sheet.getRange(i + 2, 1, 1, 12).setBackground(color);
  });
}

function isToday(d) {
  return d.toDateString() === new Date().toDateString();
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function logToSheet(ss, event, detail) {
  const log = getOrCreateSheet(ss, CONFIG.tabLog);
  if (log.getLastRow() === 0) {
    log.appendRow(["Timestamp", "Event", "Detail"]);
  }
  log.appendRow([
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm:ss"),
    event, detail
  ]);
}

// ── TRIGGER SETUP ────────────────────────────────────────────
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("runDailySync")
    .timeBased().everyDays(1).atHour(23).create(); // 11 PM
  SpreadsheetApp.getUi().alert("✅ Daily auto-sync enabled!\n\nAgent will scan Gmail every night at 11 PM and email you a summary.");
}

// ── CUSTOM MENU ──────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🤖 JobSignal")
    .addItem("▶ Run Full Sync (all history)", "runFullSync")
    .addItem("▶ Run Daily Sync (last 7 days)", "runDailySync")
    .addItem("📊 Refresh Dashboard", "updateDashboardMenu")
    .addSeparator()
    .addItem("⏰ Enable Daily Auto-Sync (11 PM)", "createDailyTrigger")
    .addToUi();
}

function updateDashboardMenu() {
  updateDashboard(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert("✅ Dashboard refreshed!");
}
