// ============================================================
//  JOBSIGNAL LIVE DASHBOARD
//  Add this to your existing Apps Script file
//  Then Deploy as Web App to get a live URL
// ============================================================
//
//  HOW TO ADD THIS:
//  1. In Apps Script, click "+" next to Files → New Script file
//  2. Name it "Dashboard"
//  3. Paste ALL of this code in
//  4. Click Deploy → New Deployment → Web App
//     - Execute as: Me
//     - Who has access: Only myself (or Anyone if you want to share)
//  5. Copy the URL — that's your live dashboard!
// ============================================================

function doGet() {
  return HtmlService.createHtmlOutput(getDashboardHtml())
    .setTitle('JobSignal Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheetData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Applications");
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  return data.filter(r => r[0]).map(r => ({
    id:         r[0],
    date:       r[1],
    company:    r[2] || "Unknown",
    role:       r[3] || "—",
    stage:      r[4] || "Other",
    priority:   r[5] || "LOW",
    action:     r[6] || "",
    source:     r[7] || "",
    subject:    r[8] || "",
    from:       r[9] || "",
    link:       r[10] || "",
    confidence: r[11] || 0
  }));
}

function getDashboardHtml() {
  const data = getSheetData();

  // Compute stats
  const total = data.length;
  const stageCounts = {};
  data.forEach(r => { stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1; });

  const offers      = stageCounts["🎉 Offer"]        || 0;
  const finalRound  = stageCounts["🔥 Final Round"]  || 0;
  const interviews  = stageCounts["📅 Interview"]    || 0;
  const phoneScreen = stageCounts["📞 Phone Screen"] || 0;
  const advancing   = stageCounts["⏩ Advancing"]    || 0;
  const rejected    = stageCounts["❌ Rejected"]     || 0;
  const applied     = stageCounts["✅ Applied"]      || 0;
  const other       = stageCounts["📧 Other"]        || 0;
  const activeCount = total - applied - rejected - other;
  const responseRate = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  const highPriority = data.filter(r => r.priority.includes("HIGH")).length;

  // Build rows for table — sorted by date desc, high priority first
  const sorted = [...data].sort((a, b) => {
    if (a.priority.includes("HIGH") && !b.priority.includes("HIGH")) return -1;
    if (!a.priority.includes("HIGH") && b.priority.includes("HIGH")) return 1;
    return new Date(b.date) - new Date(a.date);
  });

  const tableRows = sorted.slice(0, 50).map(r => {
    const stageColor = r.stage.includes("Offer") ? "#4fffb0" :
                       r.stage.includes("Final") ? "#ffd166" :
                       r.stage.includes("Interview") ? "#6c8eff" :
                       r.stage.includes("Phone") ? "#c77dff" :
                       r.stage.includes("Advancing") ? "#4cc9f0" :
                       r.stage.includes("Rejected") ? "#ff6b6b" :
                       r.stage.includes("Applied") ? "#6b7390" : "#444";

    const priorityBadge = r.priority.includes("HIGH")   ? `<span style="color:#ff6b6b;font-weight:700;">● HIGH</span>` :
                          r.priority.includes("MEDIUM") ? `<span style="color:#ffd166;font-weight:700;">● MED</span>` :
                                                          `<span style="color:#444;font-weight:700;">● LOW</span>`;

    return `<tr class="trow">
      <td>${r.date}</td>
      <td><strong>${r.company}</strong></td>
      <td style="color:#aaa;font-size:12px;">${r.role.substring(0,40)}</td>
      <td><span style="color:${stageColor};font-size:12px;">${r.stage}</span></td>
      <td>${priorityBadge}</td>
      <td style="color:#6b7390;font-size:11px;">${r.source}</td>
      <td style="font-size:11px;color:#aaa;">${r.action.substring(0,50)}</td>
      <td><a href="${r.link}" target="_blank" style="color:#6c8eff;font-size:11px;">View →</a></td>
    </tr>`;
  }).join("");

  // Weekly bar chart data (last 8 weeks)
  const weeklyData = getWeeklyData(data);
  const maxWeekVal = Math.max(...weeklyData.map(w => w.count), 1);
  const weekBars = weeklyData.map(w => {
    const pct = Math.round((w.count / maxWeekVal) * 100);
    return `<div class="bar-col">
      <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%"></div></div>
      <div class="bar-label">${w.label}</div>
    </div>`;
  }).join("");

  // Funnel data
  const funnelData = [
    { label: "Applied", count: total, color: "#4fffb0" },
    { label: "Response", count: total - applied - other, color: "#6c8eff" },
    { label: "Interview", count: interviews + phoneScreen + finalRound, color: "#ffd166" },
    { label: "Final", count: finalRound + offers, color: "#ff9f43" },
    { label: "Offer", count: offers, color: "#ff6b6b" }
  ];
  const maxFunnel = funnelData[0].count || 1;
  const funnelBars = funnelData.map(f => {
    const pct = Math.round((f.count / maxFunnel) * 100);
    return `<div class="funnel-row">
      <div class="funnel-label">${f.label}</div>
      <div class="funnel-track"><div class="funnel-bar" style="width:${pct}%;background:${f.color};">${f.count}</div></div>
      <div class="funnel-pct">${pct}%</div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JobSignal Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#0a0d14; --s1:#111520; --s2:#161c2d;
    --border:rgba(255,255,255,0.07);
    --accent:#4fffb0; --blue:#6c8eff; --red:#ff6b6b; --yellow:#ffd166;
    --text:#e8eaf0; --muted:#6b7390;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;padding:24px;}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 70% 40% at 15% 5%,rgba(79,255,176,0.04),transparent 60%),radial-gradient(ellipse 50% 40% at 85% 90%,rgba(108,142,255,0.05),transparent 60%);pointer-events:none;}

  /* HEADER */
  .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}
  .logo{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;}
  .logo span{color:var(--accent);}
  .header-meta{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);text-align:right;}
  .live-dot{display:inline-block;width:7px;height:7px;background:var(--accent);border-radius:50%;margin-right:5px;animation:pulse 2s infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.2;}}

  /* STAT CARDS */
  .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px;}
  .stat{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden;animation:fadeUp 0.4s ease both;}
  .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
  .stat.green::before{background:var(--accent);}
  .stat.blue::before{background:var(--blue);}
  .stat.red::before{background:var(--red);}
  .stat.yellow::before{background:var(--yellow);}
  .stat.purple::before{background:#c77dff;}
  .stat.teal::before{background:#4cc9f0;}
  .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;}
  .stat-val{font-family:'Syne',sans-serif;font-size:30px;font-weight:800;line-height:1;}
  .stat-val.green{color:var(--accent);}
  .stat-val.blue{color:var(--blue);}
  .stat-val.red{color:var(--red);}
  .stat-val.yellow{color:var(--yellow);}
  .stat-val.purple{color:#c77dff;}
  .stat-val.teal{color:#4cc9f0;}
  .stat-sub{font-size:10px;color:var(--muted);margin-top:5px;font-family:'DM Mono',monospace;}

  /* GRID */
  .grid2{display:grid;grid-template-columns:1fr 320px;gap:16px;margin-bottom:16px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;}

  /* CARD */
  .card{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:18px;animation:fadeUp 0.5s ease both;}
  .card-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
  .card-badge{font-size:10px;font-family:'DM Mono',monospace;color:var(--muted);background:var(--s2);padding:3px 8px;border-radius:5px;}

  /* TABLE */
  .table-wrap{overflow-x:auto;max-height:380px;overflow-y:auto;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{padding:8px 10px;text-align:left;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--s1);font-weight:400;}
  .trow td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,0.03);}
  .trow:hover td{background:var(--s2);}

  /* CHART */
  .bar-chart{display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px;}
  .bar-col{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;}
  .bar-wrap{height:80px;display:flex;align-items:flex-end;width:100%;}
  .bar-fill{width:100%;background:linear-gradient(180deg,var(--accent),rgba(79,255,176,0.3));border-radius:3px 3px 0 0;transition:height 1s ease;min-height:2px;}
  .bar-label{font-size:9px;color:var(--muted);font-family:'DM Mono',monospace;}

  /* FUNNEL */
  .funnel-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
  .funnel-label{width:70px;font-size:11px;color:var(--muted);}
  .funnel-track{flex:1;background:var(--s2);border-radius:4px;height:20px;overflow:hidden;}
  .funnel-bar{height:100%;border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:11px;font-family:'DM Mono',monospace;color:#000;font-weight:600;transition:width 1.2s ease;min-width:24px;}
  .funnel-pct{width:36px;font-size:10px;font-family:'DM Mono',monospace;color:var(--muted);text-align:right;}

  /* STAGE DONUT (CSS only) */
  .stage-list{display:flex;flex-direction:column;gap:8px;}
  .stage-item{display:flex;align-items:center;gap:10px;font-size:12px;}
  .stage-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
  .stage-name{flex:1;color:var(--muted);}
  .stage-count{font-family:'DM Mono',monospace;font-weight:500;}
  .stage-bar-wrap{width:60px;background:var(--s2);border-radius:3px;height:4px;}
  .stage-bar-fill{height:4px;border-radius:3px;}

  /* PRIORITY FEED */
  .priority-list{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;}
  .priority-item{background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12px;}
  .priority-item.high{border-left:3px solid var(--red);}
  .priority-item.medium{border-left:3px solid var(--yellow);}
  .pi-company{font-weight:600;margin-bottom:2px;}
  .pi-action{color:var(--muted);font-size:11px;}

  /* ANIMATIONS */
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}

  /* SCROLLBAR */
  ::-webkit-scrollbar{width:3px;height:3px;}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}

  /* FILTER BAR */
  .filter-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
  .filter-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.2s;}
  .filter-btn:hover,.filter-btn.active{background:var(--s2);color:var(--text);border-color:rgba(255,255,255,0.15);}
  .filter-btn.active{border-color:var(--accent);color:var(--accent);}

  .refresh-btn{padding:6px 14px;border-radius:7px;background:var(--accent);color:#000;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;}
  .refresh-btn:hover{background:#3de89d;}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div>
    <div class="logo">Job<span>Signal</span></div>
    <div style="color:var(--muted);font-size:12px;font-family:'DM Mono',monospace;margin-top:3px;">
      <span class="live-dot"></span>Live · synced from Gmail
    </div>
  </div>
  <div class="header-meta">
    Last updated<br>
    <span style="color:var(--accent);">${new Date().toLocaleString()}</span><br><br>
    <button class="refresh-btn" onclick="location.reload()">↻ Refresh</button>
  </div>
</div>

<!-- STAT CARDS -->
<div class="stats">
  <div class="stat green" style="animation-delay:0s">
    <div class="stat-label">Total Tracked</div>
    <div class="stat-val green">${total}</div>
    <div class="stat-sub">all time</div>
  </div>
  <div class="stat blue" style="animation-delay:0.05s">
    <div class="stat-label">Active Pipeline</div>
    <div class="stat-val blue">${activeCount}</div>
    <div class="stat-sub">in progress</div>
  </div>
  <div class="stat yellow" style="animation-delay:0.1s">
    <div class="stat-label">Interviews</div>
    <div class="stat-val yellow">${interviews + phoneScreen}</div>
    <div class="stat-sub">scheduled / done</div>
  </div>
  <div class="stat purple" style="animation-delay:0.15s">
    <div class="stat-label">Final Round</div>
    <div class="stat-val purple">${finalRound}</div>
    <div class="stat-sub">almost there</div>
  </div>
  <div class="stat teal" style="animation-delay:0.2s">
    <div class="stat-label">Response Rate</div>
    <div class="stat-val teal">${responseRate}%</div>
    <div class="stat-sub">vs 18% avg</div>
  </div>
  <div class="stat red" style="animation-delay:0.25s">
    <div class="stat-label">🔴 High Priority</div>
    <div class="stat-val red">${highPriority}</div>
    <div class="stat-sub">need action now</div>
  </div>
</div>

<!-- ROW 1: TABLE + PRIORITY ACTIONS -->
<div class="grid2">

  <!-- APPLICATIONS TABLE -->
  <div class="card">
    <div class="card-title">
      All Applications
      <span class="card-badge">${total} total · top 50 shown</span>
    </div>
    <div class="filter-bar" id="filterBar">
      <button class="filter-btn active" onclick="filterTable('all',this)">All</button>
      <button class="filter-btn" onclick="filterTable('HIGH',this)">🔴 High Priority</button>
      <button class="filter-btn" onclick="filterTable('Interview',this)">📅 Interview</button>
      <button class="filter-btn" onclick="filterTable('Advancing',this)">⏩ Advancing</button>
      <button class="filter-btn" onclick="filterTable('Rejected',this)">❌ Rejected</button>
      <button class="filter-btn" onclick="filterTable('Applied',this)">✅ Applied</button>
    </div>
    <div class="table-wrap">
      <table id="appTable">
        <thead>
          <tr>
            <th>Date</th><th>Company</th><th>Role</th>
            <th>Stage</th><th>Priority</th><th>Source</th>
            <th>Action</th><th>Link</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>

  <!-- HIGH PRIORITY ACTIONS -->
  <div class="card">
    <div class="card-title">
      🔴 Action Required
      <span class="card-badge">${highPriority} items</span>
    </div>
    <div class="priority-list">
      ${sorted.filter(r => r.priority.includes("HIGH")).slice(0,10).map(r => `
        <div class="priority-item high">
          <div class="pi-company">${r.company} <span style="color:var(--muted);font-weight:400;">· ${r.stage}</span></div>
          <div class="pi-action">${r.action}</div>
        </div>
      `).join("") || '<div style="color:var(--muted);font-size:12px;padding:8px;">No high priority items 🎉</div>'}
      ${sorted.filter(r => r.priority.includes("MEDIUM")).slice(0,5).map(r => `
        <div class="priority-item medium">
          <div class="pi-company">${r.company} <span style="color:var(--muted);font-weight:400;">· ${r.stage}</span></div>
          <div class="pi-action">${r.action}</div>
        </div>
      `).join("")}
    </div>
  </div>

</div>

<!-- ROW 2: CHART + FUNNEL + STAGE BREAKDOWN -->
<div class="grid3">

  <!-- WEEKLY ACTIVITY -->
  <div class="card">
    <div class="card-title">Weekly Activity <span class="card-badge">last 8 weeks</span></div>
    <div class="bar-chart">${weekBars}</div>
  </div>

  <!-- FUNNEL -->
  <div class="card">
    <div class="card-title">Conversion Funnel <span class="card-badge">all time</span></div>
    <div style="padding:4px 0;">${funnelBars}</div>
  </div>

  <!-- STAGE BREAKDOWN -->
  <div class="card">
    <div class="card-title">Stage Breakdown <span class="card-badge">live</span></div>
    <div class="stage-list">
      ${Object.entries(stageCounts).sort((a,b)=>b[1]-a[1]).map(([stage, count]) => {
        const pct = Math.round((count/total)*100);
        const color = stage.includes("Offer") ? "#4fffb0" :
                      stage.includes("Final") ? "#ffd166" :
                      stage.includes("Interview") ? "#6c8eff" :
                      stage.includes("Phone") ? "#c77dff" :
                      stage.includes("Advancing") ? "#4cc9f0" :
                      stage.includes("Rejected") ? "#ff6b6b" :
                      stage.includes("Applied") ? "#6b7390" : "#444";
        return `<div class="stage-item">
          <div class="stage-dot" style="background:${color}"></div>
          <div class="stage-name">${stage}</div>
          <div class="stage-bar-wrap"><div class="stage-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="stage-count">${count}</div>
        </div>`;
      }).join("")}
    </div>
  </div>

</div>

<script>
  function filterTable(filter, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.trow').forEach(row => {
      if (filter === 'all') { row.style.display = ''; return; }
      const text = row.innerText;
      row.style.display = text.includes(filter) ? '' : 'none';
    });
  }
</script>

</body>
</html>`;
}

function getWeeklyData(data) {
  const weeks = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (i * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = data.filter(r => {
      const d = new Date(r.date);
      return d >= start && d < end;
    }).length;
    weeks.push({
      label: `W${8 - i}`,
      count
    });
  }
  return weeks;
}
