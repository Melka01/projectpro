/*
  PM Timeline web application
  --------------------------
  This script powers the single‑page project management tool requested by the
  user. It defines the data models, state management, UI rendering, timeline
  behaviour (including drag/resize via interact.js), local persistence, PDF
  export, and optional GitHub Gist sync. The design tokens defined in
  styles.css are used throughout via CSS classes and inline variables. Key
  accessibility practices include semantic markup and custom focus styling
  emphasised by accessibility guidance【141882014759630†L268-L331】.

  The app relies on three external libraries loaded in index.html:
    - interact.js for drag and resize interactions
    - html2canvas for converting HTML regions to canvas for PDF export
    - jsPDF (UMD build) for generating PDF documents

  See bottom of file for usage notes.
*/

(() => {
  'use strict';

  /* --------------------------------------------------------------------------
   * Utility functions
   * These helpers simplify date arithmetic, ID generation, debouncing and
   * deep copying. They avoid external dependencies to keep the app lightweight.
   */
  const uuidv4 = () => {
    // Use crypto API when available; fallback to simple random string
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const formatDate = (date) => {
    // Accept Date or string; always output YYYY-MM-DD
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const parseDate = (str) => new Date(str + 'T00:00:00');

  const addDays = (dateStr, days) => {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
  };

  const differenceInDays = (a, b) => {
    // Returns inclusive difference (end inclusive). Negative if a after b.
    const da = parseDate(a);
    const db = parseDate(b);
    // Floor difference for safety
    return Math.round((db - da) / (1000 * 60 * 60 * 24));
  };

  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

  /* --------------------------------------------------------------------------
   * Data schema definitions (authoritative)
   * The following objects define the shape of our master data. They are kept in
   * comments for reference and validated loosely in the code. Real
   * implementations should use TypeScript or run-time validation.
   */
  // Project schema:
  // {
  //   id: string,
  //   name: string,
  //   code: string,
  //   description: string,
  //   phases: ['Discover','Design','Develop','Drive'],
  //   startDate: 'YYYY-MM-DD',
  //   endDate: 'YYYY-MM-DD',
  //   status: 'Proposed'|'Active'|'On Hold'|'Completed'|'Cancelled',
  //   health: 'On Track'|'At Risk'|'Off Track',
  //   priority: 'Low'|'Medium'|'High'|'Critical',
  //   budgetPlanned: number,
  //   budgetActual: number,
  //   sponsor: string,
  //   owner: string,
  //   goals: string[],
  //   kpis: {name:string, target:string, current:string}[],
  //   tags: string[],
  //   links: {label:string, url:string}[],
  //   team: string[],        // TeamMember.id
  //   documents: string[],   // Document.id
  //   deliverables: string[],// Deliverable.id
  //   createdAt: ISO,
  //   updatedAt: ISO
  // }

  // Deliverable schema:
  // {
  //   id: string,
  //   name: string,
  //   description: string,
  //   defaultPhase: 'Discover'|'Design'|'Develop'|'Drive',
  //   tags: string[],
  //   subDeliverables: string[],
  //   isAdHoc: boolean
  // }

  // Activity schema:
  // {
  //   id: string,
  //   projectId: string,
  //   deliverableId: string|null,
  //   parentDeliverableId: string|null,
  //   title: string,
  //   phases: ['Discover','Design','Develop','Drive'],
  //   assignedTo: string|null, // TeamMember.id
  //   startDate: 'YYYY-MM-DD',
  //   endDate: 'YYYY-MM-DD',
  //   percentComplete: number,
  //   status: 'Open'|'WIP'|'Done'|'Blocked',
  //   notes: string,
  //   tags: string[],
  //   linkedDocuments: string[]
  // }

  // TeamMember schema:
  // {
  //   id: string,
  //   name: string,
  //   role: string,
  //   seniority: 'Junior'|'Medior'|'Senior'|'Lead',
  //   location: string,
  //   avatar: string|null
  // }

  // Document schema:
  // {
  //   id: string,
  //   name: string,
  //   description: string,
  //   type: string,
  //   link: string,
  //   relatedDeliverableId: string|null
  // }

  // UserSettings schema:
  // {
  //   theme: 'light'|'dark',
  //   branding: { logoDataUrl: string|null },
  //   gist: { enabled: boolean, gistId: string|null, githubTokenMasked: string|null }
  // }

  /* --------------------------------------------------------------------------
   * Application state and persistence
   */
  const DB_KEY = 'pm-timeline-db-v1';
  let db = null; // Will hold the current state
  let gistToken = null; // GitHub token is stored only in memory

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        db = JSON.parse(raw);
        // Ensure lists exist
        db.projects = db.projects || [];
        db.deliverables = db.deliverables || [];
        db.activities = db.activities || [];
        db.teamMembers = db.teamMembers || [];
        db.documents = db.documents || [];
        db.userSettings = db.userSettings || { theme: 'light', branding: {}, gist: { enabled: false, gistId: null, githubTokenMasked: null } };
        return;
      }
    } catch (e) {
      console.error('Failed to load DB', e);
    }
    // If no DB exists, seed initial data
    seedData();
    saveDB();
  }

  function seedData() {
    // Create default deliverables from spec (names correspond to numbered list)
    const defaultNames = [
      'Kick‑off Document',
      'Security and compliancy start point',
      'Value Case',
      'Service Blueprint',
      'Roadmap',
      'Backlog',
      'Syllabus',
      'PSA (incl Domain Model) & Information Architecture',
      'Wireframe (Figma)',
      'PoC / Functional Design',
      'Governance Structure (incl. test automation setup)',
      'Statement of Work for Develop',
      'End presentation D&D',
    ];
    const defaultPhases = [
      'Discover',
      'Discover',
      'Discover',
      'Discover',
      'Discover',
      'Discover',
      'Design',
      'Design',
      'Design',
      'Develop',
      'Develop',
      'Develop',
      'Drive',
    ];
    const deliverables = defaultNames.map((name, idx) => ({
      id: uuidv4(),
      name,
      description: name,
      defaultPhase: defaultPhases[idx],
      tags: [],
      subDeliverables: [],
      isAdHoc: false,
    }));
    // Team members
    const teamMembers = [
      {
        id: uuidv4(),
        name: 'Alice Johnson',
        role: 'Product Owner',
        seniority: 'Senior',
        location: 'Amsterdam',
        avatar: null,
      },
      {
        id: uuidv4(),
        name: 'Bob Smith',
        role: 'Developer',
        seniority: 'Medior',
        location: 'Rotterdam',
        avatar: null,
      },
      {
        id: uuidv4(),
        name: 'Charlie Lee',
        role: 'Designer',
        seniority: 'Junior',
        location: 'Utrecht',
        avatar: null,
      },
    ];
    // Documents
    const documents = [
      {
        id: uuidv4(),
        name: 'Project Charter',
        description: 'High level overview of the project goals and scope.',
        type: 'PDF',
        link: 'https://example.com/charter.pdf',
        relatedDeliverableId: null,
      },
      {
        id: uuidv4(),
        name: 'Architecture Diagram',
        description: 'System architecture drawing.',
        type: 'Image',
        link: 'https://example.com/diagram.png',
        relatedDeliverableId: null,
      },
    ];
    // Project
    const project = {
      id: uuidv4(),
      name: 'Sample Project',
      code: 'SP1',
      description: 'A demonstration project to seed the PM timeline.',
      phases: ['Discover', 'Design', 'Develop', 'Drive'],
      startDate: '2025-08-01',
      endDate: '2025-12-31',
      status: 'Active',
      health: 'On Track',
      priority: 'High',
      budgetPlanned: 100000,
      budgetActual: 20000,
      sponsor: 'Jane Doe',
      owner: 'John Doe',
      goals: ['Deliver an MVP', 'Ensure compliance'],
      kpis: [
        { name: 'Velocity', target: '20 story points/week', current: '15' },
        { name: 'Bug rate', target: '<5 per sprint', current: '3' },
      ],
      tags: ['demo'],
      links: [
        { label: 'Project Wiki', url: 'https://example.com/wiki' },
      ],
      team: [teamMembers[0].id, teamMembers[1].id, teamMembers[2].id],
      documents: [documents[0].id, documents[1].id],
      deliverables: deliverables.map(d => d.id),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Activities seeded across timeline
    const activities = [];
    // Kick‑off Document activity
    activities.push({
      id: uuidv4(),
      projectId: project.id,
      deliverableId: deliverables[0].id,
      parentDeliverableId: null,
      title: 'Kick‑off Meeting',
      phases: ['Discover'],
      assignedTo: teamMembers[0].id,
      startDate: '2025-08-02',
      endDate: '2025-08-05',
      percentComplete: 100,
      status: 'Done',
      notes: 'Initial project kickoff and alignment.',
      tags: ['kickoff'],
      linkedDocuments: [],
    });
    // Value Case activity
    activities.push({
      id: uuidv4(),
      projectId: project.id,
      deliverableId: deliverables[2].id,
      parentDeliverableId: null,
      title: 'Define Value Case',
      phases: ['Discover'],
      assignedTo: teamMembers[1].id,
      startDate: '2025-08-06',
      endDate: '2025-08-15',
      percentComplete: 40,
      status: 'WIP',
      notes: '',
      tags: [],
      linkedDocuments: [],
    });
    // Wireframe activity
    activities.push({
      id: uuidv4(),
      projectId: project.id,
      deliverableId: deliverables[8].id,
      parentDeliverableId: null,
      title: 'Design Wireframes',
      phases: ['Design'],
      assignedTo: teamMembers[2].id,
      startDate: '2025-09-01',
      endDate: '2025-09-15',
      percentComplete: 0,
      status: 'Open',
      notes: '',
      tags: [],
      linkedDocuments: [],
    });
    // PoC activity
    activities.push({
      id: uuidv4(),
      projectId: project.id,
      deliverableId: deliverables[9].id,
      parentDeliverableId: null,
      title: 'Proof of Concept',
      phases: ['Develop'],
      assignedTo: teamMembers[1].id,
      startDate: '2025-09-20',
      endDate: '2025-10-20',
      percentComplete: 0,
      status: 'Open',
      notes: '',
      tags: [],
      linkedDocuments: [],
    });

    db = {
      projects: [project],
      deliverables,
      activities,
      teamMembers,
      documents,
      userSettings: {
        theme: 'light',
        branding: { logoDataUrl: null },
        gist: { enabled: false, gistId: null, githubTokenMasked: null },
      },
    };
  }

  const saveDB = debounce(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Failed to save DB', e);
    }
  }, 300);

  /* --------------------------------------------------------------------------
   * UI state: current filters and selection
   */
  const uiState = {
    currentView: 'timeline',
    filters: {
      project: '',
      status: '',
      phase: '',
    },
    selectedActivityId: null,
  };

  /* --------------------------------------------------------------------------
   * DOM references
   */
  const dom = {};

  function cacheDOM() {
    dom.sidebarItems = document.querySelectorAll('.nav-item');
    dom.mainViews = document.querySelectorAll('.main-view');
    dom.pageTitle = document.querySelector('.page-title');
    dom.pageSubtitle = document.querySelector('.page-subtitle');
    dom.filterProject = document.getElementById('filter-project');
    dom.filterStatus = document.getElementById('filter-status');
    dom.filterPhase = document.getElementById('filter-phase');
    dom.summaryTotal = document.getElementById('summary-total');
    dom.timelineContainer = document.getElementById('timeline-container');
    dom.timelineRangeLabel = document.getElementById('timeline-range-label');
    dom.projectsList = document.getElementById('projects-list');
    dom.teamList = document.getElementById('team-list');
    dom.deliverablesList = document.getElementById('deliverables-list');
    dom.documentsList = document.getElementById('documents-list');
    dom.modalContainer = document.getElementById('modal-container');
    // Buttons
    dom.exportPdfBtn = document.getElementById('export-pdf');
    dom.syncGistBtn = document.getElementById('sync-gist');
    dom.newProjectBtn = document.getElementById('new-project');
    dom.newTeamBtn = document.getElementById('new-team-member');
    dom.newDeliverableBtn = document.getElementById('new-deliverable');
    dom.newDocumentBtn = document.getElementById('new-document');
  }

  /* --------------------------------------------------------------------------
   * Navigation and view management
   */
  function attachNavListeners() {
    dom.sidebarItems.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        showView(view);
      });
    });
  }

  function showView(view) {
    uiState.currentView = view;
    // Update nav active state
    dom.sidebarItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-view') === view);
    });
    // Show/hide main views
    dom.mainViews.forEach(main => {
      main.classList.toggle('hidden', main.id !== `${view}-view`);
    });
    // Update header texts
    switch (view) {
      case 'timeline':
        dom.pageTitle.textContent = 'Timeline View';
        dom.pageSubtitle.textContent = 'Visualise your project schedule';
        renderTimeline();
        renderSummary();
        break;
      case 'projects':
        dom.pageTitle.textContent = 'Projects';
        dom.pageSubtitle.textContent = 'Manage your projects';
        renderProjects();
        break;
      case 'team':
        dom.pageTitle.textContent = 'Team Members';
        dom.pageSubtitle.textContent = 'Manage your team roster';
        renderTeam();
        break;
      case 'deliverables':
        dom.pageTitle.textContent = 'Deliverables';
        dom.pageSubtitle.textContent = 'Manage the deliverables catalog';
        renderDeliverables();
        break;
      case 'documents':
        dom.pageTitle.textContent = 'Documents';
        dom.pageSubtitle.textContent = 'Manage document library';
        renderDocuments();
        break;
      case 'reports':
        dom.pageTitle.textContent = 'Reports';
        dom.pageSubtitle.textContent = 'Generate and export reports';
        break;
    }
  }

  /* --------------------------------------------------------------------------
   * Filters and summary
   */
  function populateFilters() {
    // Populate project dropdown
    dom.filterProject.innerHTML = '<option value="">All</option>' + db.projects
      .map(p => `<option value="${p.id}">${p.name}</option>`)
      .join('');
    // Status and phase options already in HTML
  }

  function attachFilterListeners() {
    dom.filterProject.addEventListener('change', (e) => {
      uiState.filters.project = e.target.value;
      renderTimeline();
      renderSummary();
    });
    dom.filterStatus.addEventListener('change', (e) => {
      uiState.filters.status = e.target.value;
      renderTimeline();
      renderSummary();
    });
    dom.filterPhase.addEventListener('change', (e) => {
      uiState.filters.phase = e.target.value;
      renderTimeline();
      renderSummary();
    });
  }

  function renderSummary() {
    const activities = getFilteredActivities();
    dom.summaryTotal.textContent = activities.length;
  }

  function getFilteredActivities() {
    return db.activities.filter(act => {
      // Filter by project
      if (uiState.filters.project && act.projectId !== uiState.filters.project) return false;
      // Filter by status
      if (uiState.filters.status && act.status !== uiState.filters.status) return false;
      // Filter by phase
      if (uiState.filters.phase && !act.phases.includes(uiState.filters.phase)) return false;
      return true;
    });
  }

  /* --------------------------------------------------------------------------
   * Timeline rendering and interactions
   */
  function renderTimeline() {
    const container = dom.timelineContainer;
    container.innerHTML = '';
    const activities = getFilteredActivities();
    if (activities.length === 0) {
      container.innerHTML = '<p style="padding:16px;">No activities to display.</p>';
      dom.timelineRangeLabel.textContent = '';
      return;
    }
    // Determine timeline range
    let minDate = activities.reduce((min, a) => (a.startDate < min ? a.startDate : min), activities[0].startDate);
    let maxDate = activities.reduce((max, a) => (a.endDate > max ? a.endDate : max), activities[0].endDate);
    // Expand range by 2 days on each side for aesthetics
    minDate = addDays(minDate, -2);
    maxDate = addDays(maxDate, 2);
    const totalDays = differenceInDays(minDate, maxDate) + 1;
    // Determine width per day based on container width; at least 40px per day
    const viewportWidth = container.clientWidth || 800;
    const minDayWidth = 40;
    const dayWidth = Math.max(viewportWidth / Math.min(totalDays, 30), minDayWidth);
    const timelineWidth = totalDays * dayWidth;
    // Create an inner wrapper to allow absolute positioning
    const inner = document.createElement('div');
    inner.style.position = 'relative';
    inner.style.height = '100%';
    inner.style.width = timelineWidth + 'px';
    inner.classList.add('timeline-inner');
    container.appendChild(inner);
    // Draw ticks (week or month boundaries)
    const tickInterval = totalDays > 60 ? 7 : 1; // weekly ticks for long durations
    for (let i = 0; i <= totalDays; i += tickInterval) {
      const tick = document.createElement('div');
      tick.className = 'timeline-tick';
      tick.style.left = `${i * dayWidth}px`;
      tick.style.height = '100%';
      tick.style.backgroundColor = 'var(--border)';
      inner.appendChild(tick);
    }
    // Today marker
    const todayStr = formatDate(new Date());
    if (todayStr >= minDate && todayStr <= maxDate) {
      const todayPos = differenceInDays(minDate, todayStr);
      const line = document.createElement('div');
      line.className = 'today-line';
      line.style.left = `${todayPos * dayWidth}px`;
      line.style.height = '100%';
      inner.appendChild(line);
    }
    // Range label
    dom.timelineRangeLabel.textContent = `${minDate} → ${maxDate}`;
    // Stacking rows to avoid overlaps
    const rows = [];
    const colorMap = {
      Discover: 'var(--phase-discover)',
      Design: 'var(--phase-design)',
      Develop: 'var(--phase-develop)',
      Drive: 'var(--phase-drive)',
    };
    const statusColorMap = {
      Open: 'var(--status-open)',
      WIP: 'var(--status-wip)',
      Done: 'var(--status-done)',
      Blocked: 'var(--status-blocked)',
    };
    activities.forEach(activity => {
      const startIndex = Math.max(0, differenceInDays(minDate, activity.startDate));
      const endIndex = Math.max(0, differenceInDays(minDate, activity.endDate));
      const duration = endIndex - startIndex + 1;
      // Determine row placement
      let rowIndex = 0;
      let placed = false;
      for (; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const overlap = row.some(([s, e]) => !(endIndex < s || startIndex > e));
        if (!overlap) {
          row.push([startIndex, endIndex]);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([[startIndex, endIndex]]);
        rowIndex = rows.length - 1;
      }
      // Build bar element
      const bar = document.createElement('div');
      bar.className = 'activity-bar';
      bar.style.left = `${startIndex * dayWidth}px`;
      bar.style.width = `${duration * dayWidth}px`;
      bar.style.top = `${rowIndex * 44}px`;
      bar.style.setProperty('--activity-accent', colorMap[activity.phases[0]] || 'var(--accent-blue)');
      bar.dataset.id = activity.id;
      bar.dataset.startIndex = startIndex;
      bar.dataset.endIndex = endIndex;
      bar.dataset.duration = duration;
      // Label
      const label = document.createElement('div');
      label.className = 'activity-label';
      // Avatar: use initials of assigned team member or project
      const avatarSpan = document.createElement('div');
      avatarSpan.className = 'activity-avatar';
      const member = db.teamMembers.find(tm => tm.id === activity.assignedTo);
      const initials = member ? member.name.split(/\s+/).map(p => p[0]).join('').substring(0, 2).toUpperCase() : '?';
      avatarSpan.textContent = initials;
      label.appendChild(avatarSpan);
      const textSpan = document.createElement('span');
      textSpan.textContent = activity.title;
      label.appendChild(textSpan);
      bar.appendChild(label);
      // Status pill
      const pill = document.createElement('span');
      pill.className = 'status-pill';
      pill.textContent = activity.status;
      pill.style.backgroundColor = statusColorMap[activity.status] || 'var(--status-open)';
      bar.appendChild(pill);
      // Click handler to open modal
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        uiState.selectedActivityId = activity.id;
        openActivityModal(activity.id);
      });
      // Set up drag and resize via interact.js
      interact(bar)
        .draggable({
          // Only allow horizontal dragging
          listeners: {
            start(event) {
              bar._origX = parseFloat(bar.style.left);
              bar._origStartIdx = parseInt(bar.dataset.startIndex);
              bar._origEndIdx = parseInt(bar.dataset.endIndex);
            },
            move(event) {
              const dx = event.dx;
              const newLeft = bar._origX + dx;
              let newStartIdx = Math.round(newLeft / dayWidth);
              newStartIdx = Math.max(0, Math.min(totalDays - duration, newStartIdx));
              const newEndIdx = newStartIdx + duration - 1;
              // Temporarily position bar
              bar.style.left = `${newStartIdx * dayWidth}px`;
              bar.dataset.tempStartIndex = newStartIdx;
              bar.dataset.tempEndIndex = newEndIdx;
            },
            end(event) {
              const tmpStart = parseInt(bar.dataset.tempStartIndex);
              if (!isNaN(tmpStart) && tmpStart !== parseInt(bar.dataset.startIndex)) {
                const deltaDays = tmpStart - parseInt(bar.dataset.startIndex);
                // Update activity dates
                activity.startDate = addDays(activity.startDate, deltaDays);
                activity.endDate = addDays(activity.endDate, deltaDays);
                saveDB();
                // Re-render timeline to recompute stacking
                renderTimeline();
              } else {
                // Reset position if unchanged
                bar.style.left = `${parseInt(bar.dataset.startIndex) * dayWidth}px`;
              }
              delete bar.dataset.tempStartIndex;
              delete bar.dataset.tempEndIndex;
            },
          },
          // Keep within timeline bounds
          modifiers: [
            interact.modifiers.restrictRect({
              restriction: 'parent',
              endOnly: true,
            }),
          ],
        })
        .resizable({
          edges: { left: true, right: true, top: false, bottom: false },
          modifiers: [
            interact.modifiers.snap({
              targets: [interact.snappers.grid({ x: dayWidth, y: 1 })],
              range: dayWidth,
              relativePoints: [{ x: 0, y: 0 }],
            }),
            interact.modifiers.restrictEdges({
              outer: 'parent',
            }),
          ],
          listeners: {
            start(event) {
              bar._origStartIdx = parseInt(bar.dataset.startIndex);
              bar._origEndIdx = parseInt(bar.dataset.endIndex);
            },
            move(event) {
              let newStartIdx = bar._origStartIdx;
              let newEndIdx = bar._origEndIdx;
              if (event.edges.left) {
                const dx = event.deltaRect.left;
                const diff = Math.round(dx / dayWidth);
                newStartIdx = Math.max(0, bar._origStartIdx + diff);
              }
              if (event.edges.right) {
                const dw = event.deltaRect.width;
                const diff = Math.round(dw / dayWidth);
                newEndIdx = Math.max(newStartIdx, bar._origEndIdx + diff);
              }
              // Limit within timeline
              newEndIdx = Math.min(totalDays - 1, newEndIdx);
              // Update width and left
              const newDuration = newEndIdx - newStartIdx + 1;
              bar.style.left = `${newStartIdx * dayWidth}px`;
              bar.style.width = `${newDuration * dayWidth}px`;
              bar.dataset.tempStartIndex = newStartIdx;
              bar.dataset.tempEndIndex = newEndIdx;
            },
            end(event) {
              const tmpStart = parseInt(bar.dataset.tempStartIndex);
              const tmpEnd = parseInt(bar.dataset.tempEndIndex);
              if (!isNaN(tmpStart) && !isNaN(tmpEnd)) {
                const newStartDate = addDays(minDate, tmpStart);
                const newEndDate = addDays(minDate, tmpEnd);
                activity.startDate = newStartDate;
                activity.endDate = newEndDate;
                saveDB();
                renderTimeline();
              }
              delete bar.dataset.tempStartIndex;
              delete bar.dataset.tempEndIndex;
            },
          },
        });
      inner.appendChild(bar);
    });
    // Set container height based on rows
    inner.style.height = `${rows.length * 44}px`;
  }

  /* --------------------------------------------------------------------------
   * CRUD rendering functions
   */
  function renderProjects() {
    dom.projectsList.innerHTML = '';
    db.projects.forEach(project => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${project.name}</td>
        <td>${project.code}</td>
        <td>${project.status}</td>
        <td>${project.health}</td>
        <td>${project.priority}</td>
        <td>${project.startDate} – ${project.endDate}</td>
        <td>
          <button class="btn ghost" data-action="edit" title="Edit project">Edit</button>
        </td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        openProjectModal(project.id);
      });
      dom.projectsList.appendChild(tr);
    });
  }

  function renderTeam() {
    dom.teamList.innerHTML = '';
    db.teamMembers.forEach(member => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${member.name}</td>
        <td>${member.role}</td>
        <td>${member.seniority}</td>
        <td>${member.location}</td>
        <td>
          <button class="btn ghost" title="Edit member">Edit</button>
        </td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        openTeamModal(member.id);
      });
      dom.teamList.appendChild(tr);
    });
  }

  function renderDeliverables() {
    dom.deliverablesList.innerHTML = '';
    db.deliverables.forEach(del => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${del.name}</td>
        <td>${del.defaultPhase}</td>
        <td>${del.tags.join(', ')}</td>
        <td><button class="btn ghost" title="Edit deliverable">Edit</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        openDeliverableModal(del.id);
      });
      dom.deliverablesList.appendChild(tr);
    });
  }

  function renderDocuments() {
    dom.documentsList.innerHTML = '';
    db.documents.forEach(doc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${doc.name}</td>
        <td>${doc.type}</td>
        <td>${doc.description}</td>
        <td><button class="btn ghost" title="Edit document">Edit</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        openDocumentModal(doc.id);
      });
      dom.documentsList.appendChild(tr);
    });
  }

  /* --------------------------------------------------------------------------
   * Modal management
   */
  function openModal(content, options = {}) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    if (options.id) overlay.id = options.id;
    // Create modal content container
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.tabIndex = -1;
    modal.appendChild(content);
    overlay.appendChild(modal);
    dom.modalContainer.appendChild(overlay);
    // Display overlay
    setTimeout(() => overlay.classList.add('active'), 10);
    // Focus on modal for keyboard accessibility
    setTimeout(() => modal.focus(), 50);
    // Close on click outside or on Escape
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        closeModal(overlay);
        document.removeEventListener('keydown', onKey);
      }
    });
    return overlay;
  }

  function closeModal(overlay) {
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
      }, 120);
    }
  }

  /* --------------------------------------------------------------------------
   * Activity modal
   */
  function openActivityModal(id) {
    const activity = db.activities.find(a => a.id === id);
    const isNew = !activity;
    const act = isNew ? {
      id: uuidv4(),
      projectId: uiState.filters.project || (db.projects[0] && db.projects[0].id),
      deliverableId: null,
      parentDeliverableId: null,
      title: '',
      phases: [],
      assignedTo: null,
      startDate: formatDate(new Date()),
      endDate: formatDate(new Date()),
      percentComplete: 0,
      status: 'Open',
      notes: '',
      tags: [],
      linkedDocuments: [],
    } : deepCopy(activity);
    // Build modal content
    const content = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.textContent = isNew ? 'New Activity' : 'Edit Activity';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn ghost';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => closeModal(overlay));
    header.appendChild(closeBtn);
    content.appendChild(header);
    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'modal-tabs';
    const tabNames = ['Details', 'Team', 'Notes', 'Docs'];
    let activeTab = 'Details';
    const tabButtons = {};
    tabNames.forEach(name => {
      const tab = document.createElement('div');
      tab.className = 'modal-tab' + (name === activeTab ? ' active' : '');
      tab.textContent = name;
      tab.addEventListener('click', () => {
        activeTab = name;
        Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
        tab.classList.add('active');
        updateTab();
      });
      tabButtons[name] = tab;
      tabs.appendChild(tab);
    });
    content.appendChild(tabs);
    // Tab content container
    const tabContainer = document.createElement('div');
    tabContainer.className = 'modal-content';
    content.appendChild(tabContainer);
    function updateTab() {
      tabContainer.innerHTML = '';
      if (activeTab === 'Details') {
        const form = document.createElement('form');
        // Title
        const g1 = document.createElement('div');
        g1.className = 'form-group';
        const l1 = document.createElement('label'); l1.textContent = 'Title *';
        const i1 = document.createElement('input'); i1.type = 'text'; i1.value = act.title;
        i1.required = true;
        i1.addEventListener('input', (e) => { act.title = e.target.value; });
        g1.appendChild(l1); g1.appendChild(i1);
        form.appendChild(g1);
        // Project selection
        const gProj = document.createElement('div'); gProj.className = 'form-group';
        const lp = document.createElement('label'); lp.textContent = 'Project *';
        const sp = document.createElement('select');
        db.projects.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id; opt.textContent = p.name;
          if (p.id === act.projectId) opt.selected = true;
          sp.appendChild(opt);
        });
        sp.addEventListener('change', (e) => { act.projectId = e.target.value; });
        gProj.appendChild(lp); gProj.appendChild(sp);
        form.appendChild(gProj);
        // Deliverable selection (optional)
        const gDel = document.createElement('div'); gDel.className = 'form-group';
        const ld = document.createElement('label'); ld.textContent = 'Deliverable';
        const sd = document.createElement('select');
        const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = 'None';
        sd.appendChild(noneOpt);
        db.deliverables.forEach(d => {
          const opt = document.createElement('option'); opt.value = d.id; opt.textContent = d.name;
          if (d.id === act.deliverableId) opt.selected = true;
          sd.appendChild(opt);
        });
        sd.addEventListener('change', (e) => { act.deliverableId = e.target.value || null; });
        gDel.appendChild(ld); gDel.appendChild(sd);
        form.appendChild(gDel);
        // Phases (multi-select checkboxes)
        const gPh = document.createElement('div'); gPh.className = 'form-group';
        const lph = document.createElement('label'); lph.textContent = 'Phases *';
        gPh.appendChild(lph);
        const phaseList = document.createElement('div'); phaseList.className = 'multi-select-list';
        ['Discover','Design','Develop','Drive'].forEach(ph => {
          const item = document.createElement('div'); item.className = 'multi-select-item';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'ph-' + ph;
          cb.checked = act.phases.includes(ph);
          cb.addEventListener('change', (e) => {
            if (e.target.checked) {
              if (!act.phases.includes(ph)) act.phases.push(ph);
            } else {
              act.phases = act.phases.filter(p => p !== ph);
            }
          });
          const lb = document.createElement('label'); lb.setAttribute('for', 'ph-' + ph); lb.textContent = ph;
          item.appendChild(cb);
          item.appendChild(lb);
          phaseList.appendChild(item);
        });
        gPh.appendChild(phaseList);
        form.appendChild(gPh);
        // Dates
        const gDates = document.createElement('div'); gDates.className = 'form-group';
        const ls = document.createElement('label'); ls.textContent = 'Start Date *';
        const isd = document.createElement('input'); isd.type = 'date'; isd.value = act.startDate;
        isd.addEventListener('change', (e) => { act.startDate = e.target.value; });
        const le = document.createElement('label'); le.textContent = 'End Date *';
        const ied = document.createElement('input'); ied.type = 'date'; ied.value = act.endDate;
        ied.addEventListener('change', (e) => { act.endDate = e.target.value; });
        gDates.appendChild(ls); gDates.appendChild(isd);
        gDates.appendChild(le); gDates.appendChild(ied);
        form.appendChild(gDates);
        // Status select
        const gStatus = document.createElement('div'); gStatus.className = 'form-group';
        const ls2 = document.createElement('label'); ls2.textContent = 'Status *';
        const ss = document.createElement('select');
        ['Open','WIP','Done','Blocked'].forEach(s => {
          const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
          if (s === act.status) opt.selected = true;
          ss.appendChild(opt);
        });
        ss.addEventListener('change', (e) => { act.status = e.target.value; });
        gStatus.appendChild(ls2); gStatus.appendChild(ss);
        form.appendChild(gStatus);
        // Percent complete range
        const gPct = document.createElement('div'); gPct.className = 'form-group';
        const lpct = document.createElement('label'); lpct.textContent = 'Percent Complete';
        const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = 100; rng.value = act.percentComplete;
        const pctVal = document.createElement('span'); pctVal.textContent = act.percentComplete + '%'; pctVal.style.marginLeft = '8px';
        rng.addEventListener('input', (e) => {
          act.percentComplete = parseInt(e.target.value);
          pctVal.textContent = act.percentComplete + '%';
        });
        gPct.appendChild(lpct); gPct.appendChild(rng); gPct.appendChild(pctVal);
        form.appendChild(gPct);
        tabContainer.appendChild(form);
      } else if (activeTab === 'Team') {
        // Team tab
        const form = document.createElement('form');
        const grp = document.createElement('div'); grp.className = 'form-group';
        const label = document.createElement('label'); label.textContent = 'Assigned To';
        const sel = document.createElement('select');
        const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = 'Unassigned';
        sel.appendChild(noneOpt);
        db.teamMembers.forEach(tm => {
          const opt = document.createElement('option'); opt.value = tm.id; opt.textContent = tm.name;
          if (tm.id === act.assignedTo) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', (e) => {
          act.assignedTo = e.target.value || null;
        });
        grp.appendChild(label); grp.appendChild(sel);
        form.appendChild(grp);
        tabContainer.appendChild(form);
      } else if (activeTab === 'Notes') {
        const form = document.createElement('form');
        const grp = document.createElement('div'); grp.className = 'form-group';
        const label = document.createElement('label'); label.textContent = 'Notes';
        const ta = document.createElement('textarea'); ta.value = act.notes;
        ta.addEventListener('input', (e) => { act.notes = e.target.value; });
        grp.appendChild(label); grp.appendChild(ta);
        form.appendChild(grp);
        tabContainer.appendChild(form);
      } else if (activeTab === 'Docs') {
        // Linked documents multi-select
        const form = document.createElement('form');
        const grp = document.createElement('div'); grp.className = 'form-group';
        const label = document.createElement('label'); label.textContent = 'Linked Documents';
        const list = document.createElement('div'); list.className = 'multi-select-list';
        db.documents.forEach(doc => {
          const item = document.createElement('div'); item.className = 'multi-select-item';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'doc-' + doc.id;
          cb.checked = act.linkedDocuments.includes(doc.id);
          cb.addEventListener('change', (e) => {
            if (e.target.checked) act.linkedDocuments.push(doc.id);
            else act.linkedDocuments = act.linkedDocuments.filter(id => id !== doc.id);
          });
          const lb = document.createElement('label'); lb.setAttribute('for', 'doc-' + doc.id); lb.textContent = doc.name;
          item.appendChild(cb); item.appendChild(lb);
          list.appendChild(item);
        });
        grp.appendChild(label); grp.appendChild(list);
        form.appendChild(grp);
        tabContainer.appendChild(form);
      }
    }
    updateTab();
    // Footer with actions
    const footer = document.createElement('div'); footer.className = 'modal-footer';
    if (!isNew) {
      const delBtn = document.createElement('button'); delBtn.className = 'btn destructive'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this activity?')) {
          db.activities = db.activities.filter(a => a.id !== act.id);
          saveDB();
          renderTimeline();
          renderSummary();
          closeModal(overlay);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn ghost'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeModal(overlay));
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      // Validate required fields
      if (!act.title.trim()) { alert('Title is required'); return; }
      if (!act.startDate || !act.endDate) { alert('Start and end dates are required'); return; }
      if (parseDate(act.endDate) < parseDate(act.startDate)) { alert('End date cannot be before start date'); return; }
      if (!act.phases || act.phases.length === 0) { alert('At least one phase must be selected'); return; }
      if (isNew) {
        db.activities.push(act);
      } else {
        const idx = db.activities.findIndex(a => a.id === act.id);
        db.activities[idx] = act;
      }
      saveDB();
      renderTimeline();
      renderSummary();
      closeModal(overlay);
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    content.appendChild(footer);
    // Open modal
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * Project modal
   */
  function openProjectModal(id) {
    const project = db.projects.find(p => p.id === id);
    const isNew = !project;
    const proj = isNew ? {
      id: uuidv4(),
      name: '',
      code: '',
      description: '',
      phases: [],
      startDate: formatDate(new Date()),
      endDate: formatDate(new Date()),
      status: 'Proposed',
      health: 'On Track',
      priority: 'Medium',
      budgetPlanned: 0,
      budgetActual: 0,
      sponsor: '',
      owner: '',
      goals: [],
      kpis: [],
      tags: [],
      links: [],
      team: [],
      documents: [],
      deliverables: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } : deepCopy(project);
    // Build content
    const content = document.createElement('div');
    const header = document.createElement('div'); header.className = 'modal-header';
    const title = document.createElement('h3'); title.textContent = isNew ? 'New Project' : 'Edit Project';
    header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn ghost'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click', () => closeModal(overlay));
    header.appendChild(closeBtn);
    content.appendChild(header);
    // Form
    const form = document.createElement('form');
    // Name
    const gn = document.createElement('div'); gn.className = 'form-group';
    const ln = document.createElement('label'); ln.textContent = 'Name *';
    const inpt = document.createElement('input'); inpt.type = 'text'; inpt.value = proj.name;
    inpt.required = true;
    inpt.addEventListener('input', e => proj.name = e.target.value);
    gn.appendChild(ln); gn.appendChild(inpt);
    form.appendChild(gn);
    // Code
    const gc = document.createElement('div'); gc.className = 'form-group';
    const lc = document.createElement('label'); lc.textContent = 'Code *';
    const ic = document.createElement('input'); ic.type = 'text'; ic.value = proj.code;
    ic.required = true;
    ic.addEventListener('input', e => proj.code = e.target.value);
    gc.appendChild(lc); gc.appendChild(ic);
    form.appendChild(gc);
    // Description
    const gd = document.createElement('div'); gd.className = 'form-group';
    const ld = document.createElement('label'); ld.textContent = 'Description';
    const ta = document.createElement('textarea'); ta.value = proj.description;
    ta.addEventListener('input', e => proj.description = e.target.value);
    gd.appendChild(ld); gd.appendChild(ta);
    form.appendChild(gd);
    // Dates
    const gDates = document.createElement('div'); gDates.className = 'form-group';
    const ls = document.createElement('label'); ls.textContent = 'Start Date *';
    const isd = document.createElement('input'); isd.type = 'date'; isd.value = proj.startDate; isd.addEventListener('change', e => proj.startDate = e.target.value);
    const le = document.createElement('label'); le.textContent = 'End Date *';
    const ied = document.createElement('input'); ied.type = 'date'; ied.value = proj.endDate; ied.addEventListener('change', e => proj.endDate = e.target.value);
    gDates.appendChild(ls); gDates.appendChild(isd);
    gDates.appendChild(le); gDates.appendChild(ied);
    form.appendChild(gDates);
    // Phases multi-select checkboxes
    const gPh = document.createElement('div'); gPh.className = 'form-group';
    const lph = document.createElement('label'); lph.textContent = 'Phases *';
    const phaseList = document.createElement('div'); phaseList.className = 'multi-select-list';
    ['Discover','Design','Develop','Drive'].forEach(ph => {
      const item = document.createElement('div'); item.className = 'multi-select-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'prph-' + ph;
      cb.checked = proj.phases.includes(ph);
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          if (!proj.phases.includes(ph)) proj.phases.push(ph);
        } else {
          proj.phases = proj.phases.filter(x => x !== ph);
        }
      });
      const lb = document.createElement('label'); lb.setAttribute('for', 'prph-' + ph); lb.textContent = ph;
      item.appendChild(cb); item.appendChild(lb);
      phaseList.appendChild(item);
    });
    gPh.appendChild(lph); gPh.appendChild(phaseList);
    form.appendChild(gPh);
    // Status select
    const gStatus = document.createElement('div'); gStatus.className = 'form-group';
    const ls2 = document.createElement('label'); ls2.textContent = 'Status *';
    const ss = document.createElement('select');
    ['Proposed','Active','On Hold','Completed','Cancelled'].forEach(s => {
      const opt = document.createElement('option'); opt.value = s; opt.textContent = s;
      if (s === proj.status) opt.selected = true;
      ss.appendChild(opt);
    });
    ss.addEventListener('change', e => proj.status = e.target.value);
    gStatus.appendChild(ls2); gStatus.appendChild(ss);
    form.appendChild(gStatus);
    // Health select
    const gHealth = document.createElement('div'); gHealth.className = 'form-group';
    const lh = document.createElement('label'); lh.textContent = 'Health';
    const sh = document.createElement('select');
    ['On Track','At Risk','Off Track'].forEach(h => {
      const opt = document.createElement('option'); opt.value = h; opt.textContent = h;
      if (h === proj.health) opt.selected = true;
      sh.appendChild(opt);
    });
    sh.addEventListener('change', e => proj.health = e.target.value);
    gHealth.appendChild(lh); gHealth.appendChild(sh);
    form.appendChild(gHealth);
    // Priority select
    const gPri = document.createElement('div'); gPri.className = 'form-group';
    const lpri = document.createElement('label'); lpri.textContent = 'Priority';
    const spri = document.createElement('select');
    ['Low','Medium','High','Critical'].forEach(pr => {
      const opt = document.createElement('option'); opt.value = pr; opt.textContent = pr;
      if (pr === proj.priority) opt.selected = true;
      spri.appendChild(opt);
    });
    spri.addEventListener('change', e => proj.priority = e.target.value);
    gPri.appendChild(lpri); gPri.appendChild(spri);
    form.appendChild(gPri);
    // Sponsor, Owner
    const gSponsor = document.createElement('div'); gSponsor.className = 'form-group';
    const lspon = document.createElement('label'); lspon.textContent = 'Sponsor';
    const ispon = document.createElement('input'); ispon.type = 'text'; ispon.value = proj.sponsor; ispon.addEventListener('input', e => proj.sponsor = e.target.value);
    gSponsor.appendChild(lspon); gSponsor.appendChild(ispon);
    form.appendChild(gSponsor);
    const gOwner = document.createElement('div'); gOwner.className = 'form-group';
    const lown = document.createElement('label'); lown.textContent = 'Owner';
    const iown = document.createElement('input'); iown.type = 'text'; iown.value = proj.owner; iown.addEventListener('input', e => proj.owner = e.target.value);
    gOwner.appendChild(lown); gOwner.appendChild(iown);
    form.appendChild(gOwner);
    // Team multi-select
    const gTeam = document.createElement('div'); gTeam.className = 'form-group';
    const lt = document.createElement('label'); lt.textContent = 'Team';
    const teamList = document.createElement('div'); teamList.className = 'multi-select-list';
    db.teamMembers.forEach(tm => {
      const item = document.createElement('div'); item.className = 'multi-select-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'pr-team-' + tm.id; cb.checked = proj.team.includes(tm.id);
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          if (!proj.team.includes(tm.id)) proj.team.push(tm.id);
        } else {
          proj.team = proj.team.filter(id => id !== tm.id);
        }
      });
      const lb = document.createElement('label'); lb.setAttribute('for', cb.id); lb.textContent = tm.name;
      item.appendChild(cb); item.appendChild(lb);
      teamList.appendChild(item);
    });
    gTeam.appendChild(lt); gTeam.appendChild(teamList);
    form.appendChild(gTeam);
    // Deliverables multi-select
    const gDel = document.createElement('div'); gDel.className = 'form-group';
    const ldel = document.createElement('label'); ldel.textContent = 'Deliverables';
    const delList = document.createElement('div'); delList.className = 'multi-select-list';
    db.deliverables.forEach(del => {
      const item = document.createElement('div'); item.className = 'multi-select-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'pr-del-' + del.id; cb.checked = proj.deliverables.includes(del.id);
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          if (!proj.deliverables.includes(del.id)) proj.deliverables.push(del.id);
        } else {
          proj.deliverables = proj.deliverables.filter(id => id !== del.id);
        }
      });
      const lb = document.createElement('label'); lb.setAttribute('for', cb.id); lb.textContent = del.name;
      item.appendChild(cb); item.appendChild(lb);
      delList.appendChild(item);
    });
    gDel.appendChild(ldel); gDel.appendChild(delList);
    form.appendChild(gDel);
    // Documents multi-select
    const gDocs = document.createElement('div'); gDocs.className = 'form-group';
    const ldocs = document.createElement('label'); ldocs.textContent = 'Documents';
    const docsList = document.createElement('div'); docsList.className = 'multi-select-list';
    db.documents.forEach(doc => {
      const item = document.createElement('div'); item.className = 'multi-select-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'pr-doc-' + doc.id; cb.checked = proj.documents.includes(doc.id);
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          if (!proj.documents.includes(doc.id)) proj.documents.push(doc.id);
        } else {
          proj.documents = proj.documents.filter(id => id !== doc.id);
        }
      });
      const lb = document.createElement('label'); lb.setAttribute('for', cb.id); lb.textContent = doc.name;
      item.appendChild(cb); item.appendChild(lb);
      docsList.appendChild(item);
    });
    gDocs.appendChild(ldocs); gDocs.appendChild(docsList);
    form.appendChild(gDocs);
    content.appendChild(form);
    // Footer actions
    const footer = document.createElement('div'); footer.className = 'modal-footer';
    if (!isNew) {
      const delBtn = document.createElement('button'); delBtn.className = 'btn destructive'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this project?')) {
          // Remove project and its activities
          db.projects = db.projects.filter(p => p.id !== proj.id);
          db.activities = db.activities.filter(a => a.projectId !== proj.id);
          saveDB();
          renderProjects();
          renderTimeline();
          renderSummary();
          closeModal(overlay);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn ghost'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', () => closeModal(overlay));
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save'; saveBtn.addEventListener('click', () => {
      if (!proj.name.trim() || !proj.code.trim()) { alert('Name and code are required'); return; }
      if (parseDate(proj.endDate) < parseDate(proj.startDate)) { alert('End date cannot be before start date'); return; }
      proj.updatedAt = new Date().toISOString();
      if (isNew) {
        proj.createdAt = new Date().toISOString();
        db.projects.push(proj);
      } else {
        const idx = db.projects.findIndex(p => p.id === proj.id);
        db.projects[idx] = proj;
      }
      saveDB();
      populateFilters();
      renderProjects();
      renderTimeline();
      renderSummary();
      closeModal(overlay);
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    content.appendChild(footer);
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * Team modal
   */
  function openTeamModal(id) {
    const member = db.teamMembers.find(tm => tm.id === id);
    const isNew = !member;
    const tm = isNew ? {
      id: uuidv4(),
      name: '',
      role: '',
      seniority: 'Medior',
      location: '',
      avatar: null,
    } : deepCopy(member);
    const content = document.createElement('div');
    const header = document.createElement('div'); header.className = 'modal-header';
    const title = document.createElement('h3'); title.textContent = isNew ? 'New Team Member' : 'Edit Team Member';
    header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn ghost'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click', () => closeModal(overlay));
    header.appendChild(closeBtn);
    content.appendChild(header);
    // Form
    const form = document.createElement('form');
    // Name
    const gn = document.createElement('div'); gn.className = 'form-group';
    const ln = document.createElement('label'); ln.textContent = 'Name *';
    const inpt = document.createElement('input'); inpt.type = 'text'; inpt.value = tm.name;
    inpt.required = true;
    inpt.addEventListener('input', e => tm.name = e.target.value);
    gn.appendChild(ln); gn.appendChild(inpt);
    form.appendChild(gn);
    // Role
    const gr = document.createElement('div'); gr.className = 'form-group';
    const lr = document.createElement('label'); lr.textContent = 'Role';
    const ir = document.createElement('input'); ir.type = 'text'; ir.value = tm.role; ir.addEventListener('input', e => tm.role = e.target.value);
    gr.appendChild(lr); gr.appendChild(ir);
    form.appendChild(gr);
    // Seniority select
    const gs = document.createElement('div'); gs.className = 'form-group';
    const ls = document.createElement('label'); ls.textContent = 'Seniority';
    const ss = document.createElement('select');
    ['Junior','Medior','Senior','Lead'].forEach(opt => {
      const option = document.createElement('option'); option.value = opt; option.textContent = opt;
      if (opt === tm.seniority) option.selected = true;
      ss.appendChild(option);
    });
    ss.addEventListener('change', e => tm.seniority = e.target.value);
    gs.appendChild(ls); gs.appendChild(ss);
    form.appendChild(gs);
    // Location
    const gloc = document.createElement('div'); gloc.className = 'form-group';
    const lloc = document.createElement('label'); lloc.textContent = 'Location';
    const iloc = document.createElement('input'); iloc.type = 'text'; iloc.value = tm.location; iloc.addEventListener('input', e => tm.location = e.target.value);
    gloc.appendChild(lloc); gloc.appendChild(iloc);
    form.appendChild(gloc);
    content.appendChild(form);
    // Footer
    const footer = document.createElement('div'); footer.className = 'modal-footer';
    if (!isNew) {
      const delBtn = document.createElement('button'); delBtn.className = 'btn destructive'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        if (confirm('Delete this team member?')) {
          // Remove member from db
          db.teamMembers = db.teamMembers.filter(t => t.id !== tm.id);
          // Remove assignment from activities
          db.activities.forEach(a => { if (a.assignedTo === tm.id) a.assignedTo = null; });
          saveDB();
          renderTeam();
          renderTimeline();
          renderSummary();
          closeModal(overlay);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn ghost'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', () => closeModal(overlay));
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save'; saveBtn.addEventListener('click', () => {
      if (!tm.name.trim()) { alert('Name is required'); return; }
      if (isNew) {
        db.teamMembers.push(tm);
      } else {
        const idx = db.teamMembers.findIndex(t => t.id === tm.id);
        db.teamMembers[idx] = tm;
      }
      saveDB();
      renderTeam();
      renderTimeline();
      renderSummary();
      closeModal(overlay);
    });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    content.appendChild(footer);
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * Deliverable modal
   */
  function openDeliverableModal(id) {
    const del = db.deliverables.find(d => d.id === id);
    const isNew = !del;
    const dv = isNew ? {
      id: uuidv4(),
      name: '',
      description: '',
      defaultPhase: 'Discover',
      tags: [],
      subDeliverables: [],
      isAdHoc: false,
    } : deepCopy(del);
    const content = document.createElement('div');
    const header = document.createElement('div'); header.className = 'modal-header';
    const title = document.createElement('h3'); title.textContent = isNew ? 'New Deliverable' : 'Edit Deliverable';
    header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn ghost'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click', () => closeModal(overlay));
    header.appendChild(closeBtn);
    content.appendChild(header);
    // Form
    const form = document.createElement('form');
    // Name
    const gn = document.createElement('div'); gn.className = 'form-group';
    const ln = document.createElement('label'); ln.textContent = 'Name *';
    const inpt = document.createElement('input'); inpt.type = 'text'; inpt.value = dv.name;
    inpt.required = true;
    inpt.addEventListener('input', e => dv.name = e.target.value);
    gn.appendChild(ln); gn.appendChild(inpt);
    form.appendChild(gn);
    // Description
    const gd = document.createElement('div'); gd.className = 'form-group';
    const ld = document.createElement('label'); ld.textContent = 'Description';
    const ta = document.createElement('textarea'); ta.value = dv.description; ta.addEventListener('input', e => dv.description = e.target.value);
    gd.appendChild(ld); gd.appendChild(ta);
    form.appendChild(gd);
    // Default phase
    const gph = document.createElement('div'); gph.className = 'form-group';
    const lph = document.createElement('label'); lph.textContent = 'Default Phase';
    const sph = document.createElement('select');
    ['Discover','Design','Develop','Drive'].forEach(ph => {
      const opt = document.createElement('option'); opt.value = ph; opt.textContent = ph;
      if (ph === dv.defaultPhase) opt.selected = true;
      sph.appendChild(opt);
    });
    sph.addEventListener('change', e => dv.defaultPhase = e.target.value);
    gph.appendChild(lph); gph.appendChild(sph);
    form.appendChild(gph);
    // Tags input (comma separated)
    const gtags = document.createElement('div'); gtags.className = 'form-group';
    const ltags = document.createElement('label'); ltags.textContent = 'Tags (comma separated)';
    const itags = document.createElement('input'); itags.type = 'text'; itags.value = dv.tags.join(', ');
    itags.addEventListener('input', e => {
      dv.tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
    });
    gtags.appendChild(ltags); gtags.appendChild(itags);
    form.appendChild(gtags);
    // Sub-deliverables multi-select
    const gsub = document.createElement('div'); gsub.className = 'form-group';
    const lsub = document.createElement('label'); lsub.textContent = 'Sub-deliverables';
    const subList = document.createElement('div'); subList.className = 'multi-select-list';
    db.deliverables.filter(d => d.id !== dv.id).forEach(child => {
      const item = document.createElement('div'); item.className = 'multi-select-item';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'sub-' + child.id;
      cb.checked = dv.subDeliverables.includes(child.id);
      cb.addEventListener('change', e => {
        if (e.target.checked) {
          dv.subDeliverables.push(child.id);
        } else {
          dv.subDeliverables = dv.subDeliverables.filter(id => id !== child.id);
        }
      });
      const lb = document.createElement('label'); lb.setAttribute('for', cb.id); lb.textContent = child.name;
      item.appendChild(cb); item.appendChild(lb);
      subList.appendChild(item);
    });
    gsub.appendChild(lsub); gsub.appendChild(subList);
    form.appendChild(gsub);
    content.appendChild(form);
    // Footer
    const footer = document.createElement('div'); footer.className = 'modal-footer';
    if (!isNew) {
      const delBtn = document.createElement('button'); delBtn.className = 'btn destructive'; delBtn.textContent = 'Delete'; delBtn.addEventListener('click', () => {
        if (confirm('Delete this deliverable?')) {
          db.deliverables = db.deliverables.filter(d => d.id !== dv.id);
          // Remove from projects
          db.projects.forEach(p => {
            p.deliverables = p.deliverables.filter(id => id !== dv.id);
          });
          saveDB();
          renderDeliverables();
          closeModal(overlay);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn ghost'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', () => closeModal(overlay));
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save'; saveBtn.addEventListener('click', () => {
      if (!dv.name.trim()) { alert('Name is required'); return; }
      if (isNew) db.deliverables.push(dv);
      else {
        const idx = db.deliverables.findIndex(d => d.id === dv.id);
        db.deliverables[idx] = dv;
      }
      saveDB();
      renderDeliverables();
      closeModal(overlay);
    });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    content.appendChild(footer);
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * Document modal
   */
  function openDocumentModal(id) {
    const doc = db.documents.find(d => d.id === id);
    const isNew = !doc;
    const dv = isNew ? {
      id: uuidv4(),
      name: '',
      description: '',
      type: '',
      link: '',
      relatedDeliverableId: null,
    } : deepCopy(doc);
    const content = document.createElement('div');
    const header = document.createElement('div'); header.className = 'modal-header';
    const title = document.createElement('h3'); title.textContent = isNew ? 'New Document' : 'Edit Document';
    header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn ghost'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click', () => closeModal(overlay));
    header.appendChild(closeBtn);
    content.appendChild(header);
    // Form
    const form = document.createElement('form');
    // Name
    const gn = document.createElement('div'); gn.className = 'form-group';
    const ln = document.createElement('label'); ln.textContent = 'Name *';
    const inpt = document.createElement('input'); inpt.type = 'text'; inpt.value = dv.name;
    inpt.required = true;
    inpt.addEventListener('input', e => dv.name = e.target.value);
    gn.appendChild(ln); gn.appendChild(inpt);
    form.appendChild(gn);
    // Description
    const gd = document.createElement('div'); gd.className = 'form-group';
    const ld = document.createElement('label'); ld.textContent = 'Description';
    const ta = document.createElement('textarea'); ta.value = dv.description; ta.addEventListener('input', e => dv.description = e.target.value);
    gd.appendChild(ld); gd.appendChild(ta);
    form.appendChild(gd);
    // Type
    const gt = document.createElement('div'); gt.className = 'form-group';
    const lt = document.createElement('label'); lt.textContent = 'Type';
    const it = document.createElement('input'); it.type = 'text'; it.value = dv.type; it.addEventListener('input', e => dv.type = e.target.value);
    gt.appendChild(lt); gt.appendChild(it);
    form.appendChild(gt);
    // Link
    const gl = document.createElement('div'); gl.className = 'form-group';
    const ll = document.createElement('label'); ll.textContent = 'Link';
    const il = document.createElement('input'); il.type = 'url'; il.value = dv.link; il.addEventListener('input', e => dv.link = e.target.value);
    gl.appendChild(ll); gl.appendChild(il);
    form.appendChild(gl);
    // Related deliverable
    const gr = document.createElement('div'); gr.className = 'form-group';
    const lr = document.createElement('label'); lr.textContent = 'Related Deliverable';
    const sr = document.createElement('select');
    const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = 'None'; sr.appendChild(noneOpt);
    db.deliverables.forEach(del => {
      const opt = document.createElement('option'); opt.value = del.id; opt.textContent = del.name;
      if (del.id === dv.relatedDeliverableId) opt.selected = true;
      sr.appendChild(opt);
    });
    sr.addEventListener('change', e => dv.relatedDeliverableId = e.target.value || null);
    gr.appendChild(lr); gr.appendChild(sr);
    form.appendChild(gr);
    content.appendChild(form);
    // Footer
    const footer = document.createElement('div'); footer.className = 'modal-footer';
    if (!isNew) {
      const delBtn = document.createElement('button'); delBtn.className = 'btn destructive'; delBtn.textContent = 'Delete'; delBtn.addEventListener('click', () => {
        if (confirm('Delete this document?')) {
          db.documents = db.documents.filter(d => d.id !== dv.id);
          // Remove from projects and activities
          db.projects.forEach(p => { p.documents = p.documents.filter(id => id !== dv.id); });
          db.activities.forEach(a => { a.linkedDocuments = a.linkedDocuments.filter(id => id !== dv.id); });
          saveDB();
          renderDocuments();
          renderTimeline();
          renderSummary();
          closeModal(overlay);
        }
      });
      footer.appendChild(delBtn);
    }
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn ghost'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', () => closeModal(overlay));
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save'; saveBtn.addEventListener('click', () => {
      if (!dv.name.trim()) { alert('Name is required'); return; }
      if (isNew) db.documents.push(dv);
      else {
        const idx = db.documents.findIndex(d => d.id === dv.id);
        db.documents[idx] = dv;
      }
      saveDB();
      renderDocuments();
      renderTimeline();
      renderSummary();
      closeModal(overlay);
    });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    content.appendChild(footer);
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * PDF export
   */
  async function exportPdf() {
    try {
      const element = dom.timelineContainer;
      const canvas = await html2canvas(element, { backgroundColor: null });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape' });
      // Add header text
      pdf.setFontSize(14);
      pdf.text('Project Timeline', 10, 10);
      pdf.setFontSize(10);
      pdf.text(dom.timelineRangeLabel.textContent || '', 10, 17);
      // Add legend for phases and status
      const legendY = 25;
      let lx = 10;
      const legendItems = [
        { label: 'Discover', color: getComputedStyle(document.documentElement).getPropertyValue('--phase-discover').trim() },
        { label: 'Design', color: getComputedStyle(document.documentElement).getPropertyValue('--phase-design').trim() },
        { label: 'Develop', color: getComputedStyle(document.documentElement).getPropertyValue('--phase-develop').trim() },
        { label: 'Drive', color: getComputedStyle(document.documentElement).getPropertyValue('--phase-drive').trim() },
      ];
      legendItems.forEach(item => {
        pdf.setFillColor(item.color);
        pdf.rect(lx, legendY, 4, 4, 'F');
        pdf.setTextColor(0, 0, 0);
        pdf.text(item.label, lx + 6, legendY + 3);
        lx += 30;
      });
      // Add status legend
      const statusItems = [
        { label: 'Open', color: getComputedStyle(document.documentElement).getPropertyValue('--status-open').trim() },
        { label: 'WIP', color: getComputedStyle(document.documentElement).getPropertyValue('--status-wip').trim() },
        { label: 'Done', color: getComputedStyle(document.documentElement).getPropertyValue('--status-done').trim() },
        { label: 'Blocked', color: getComputedStyle(document.documentElement).getPropertyValue('--status-blocked').trim() },
      ];
      statusItems.forEach(item => {
        pdf.setFillColor(item.color);
        pdf.rect(lx, legendY, 4, 4, 'F');
        pdf.setTextColor(0, 0, 0);
        pdf.text(item.label, lx + 6, legendY + 3);
        lx += 30;
      });
      // Add branding logo if provided
      if (db.userSettings.branding && db.userSettings.branding.logoDataUrl) {
        pdf.addImage(db.userSettings.branding.logoDataUrl, 'PNG', pdf.internal.pageSize.getWidth() - 40, 5, 30, 10);
      }
      // Draw timeline image below header/legend
      const imgWidth = pdf.internal.pageSize.getWidth() - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, legendY + 10, imgWidth, imgHeight);
      pdf.save('timeline.pdf');
    } catch (e) {
      console.error('PDF export failed', e);
      alert('Failed to export PDF.');
    }
  }

  /* --------------------------------------------------------------------------
   * GitHub Gist sync (optional)
   */
  function openSyncModal() {
    const content = document.createElement('div');
    const header = document.createElement('div'); header.className = 'modal-header';
    const title = document.createElement('h3'); title.textContent = 'GitHub Gist Sync'; header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.className = 'btn ghost'; closeBtn.textContent = '×'; closeBtn.setAttribute('aria-label','Close'); closeBtn.addEventListener('click', () => closeModal(overlay)); header.appendChild(closeBtn);
    content.appendChild(header);
    const form = document.createElement('form');
    // Enabled checkbox
    const gEnable = document.createElement('div'); gEnable.className = 'form-group';
    const lEnable = document.createElement('label'); lEnable.textContent = 'Enable Gist Sync';
    const cbEnable = document.createElement('input'); cbEnable.type = 'checkbox'; cbEnable.checked = db.userSettings.gist.enabled;
    cbEnable.addEventListener('change', e => { db.userSettings.gist.enabled = e.target.checked; });
    gEnable.appendChild(lEnable); gEnable.appendChild(cbEnable);
    form.appendChild(gEnable);
    // Gist ID input
    const gId = document.createElement('div'); gId.className = 'form-group';
    const lId = document.createElement('label'); lId.textContent = 'Gist ID';
    const iId = document.createElement('input'); iId.type = 'text'; iId.value = db.userSettings.gist.gistId || '';
    iId.placeholder = 'Leave empty to create a new gist';
    iId.addEventListener('input', e => { db.userSettings.gist.gistId = e.target.value.trim() || null; });
    gId.appendChild(lId); gId.appendChild(iId);
    form.appendChild(gId);
    // Token input
    const gToken = document.createElement('div'); gToken.className = 'form-group';
    const lToken = document.createElement('label'); lToken.textContent = 'Personal Access Token';
    const iToken = document.createElement('input'); iToken.type = 'password'; iToken.value = gistToken || '';
    iToken.placeholder = 'PAT with gist scope';
    iToken.addEventListener('input', e => { gistToken = e.target.value.trim() || null; });
    gToken.appendChild(lToken); gToken.appendChild(iToken);
    form.appendChild(gToken);
    // Buttons
    const actions = document.createElement('div'); actions.className = 'modal-footer';
    const cancel = document.createElement('button'); cancel.className = 'btn ghost'; cancel.textContent = 'Close'; cancel.addEventListener('click', () => closeModal(overlay));
    const loadBtn = document.createElement('button'); loadBtn.className = 'btn secondary'; loadBtn.textContent = 'Load from Gist'; loadBtn.addEventListener('click', async () => {
      if (!db.userSettings.gist.gistId) { alert('No Gist ID specified'); return; }
      if (!gistToken) { alert('Token required'); return; }
      try {
        const res = await fetch(`https://api.github.com/gists/${db.userSettings.gist.gistId}`, {
          headers: { Authorization: 'token ' + gistToken }
        });
        if (!res.ok) throw new Error('Failed to fetch gist');
        const data = await res.json();
        const content = data.files && data.files['pm-data.json'] && data.files['pm-data.json'].content;
        if (!content) { alert('pm-data.json not found in gist'); return; }
        db = JSON.parse(content);
        saveDB();
        populateFilters();
        renderProjects(); renderTeam(); renderDeliverables(); renderDocuments(); renderTimeline(); renderSummary();
        alert('Loaded data from gist');
      } catch (err) {
        console.error(err);
        alert('Failed to load from gist');
      }
    });
    const saveBtn = document.createElement('button'); saveBtn.className = 'btn primary'; saveBtn.textContent = 'Save to Gist'; saveBtn.addEventListener('click', async () => {
      if (!gistToken) { alert('Token required'); return; }
      try {
        if (!db.userSettings.gist.gistId) {
          // Create gist
          const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
              Authorization: 'token ' + gistToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              description: 'PM Timeline DB',
              public: false,
              files: {
                'pm-data.json': { content: JSON.stringify(db) }
              }
            })
          });
          if (!res.ok) throw new Error('Failed to create gist');
          const data = await res.json();
          db.userSettings.gist.gistId = data.id;
          db.userSettings.gist.githubTokenMasked = gistToken.replace(/.(?=.{4})/g, '*');
          saveDB();
          alert('Created new gist and saved');
        } else {
          // Update gist
          const res = await fetch(`https://api.github.com/gists/${db.userSettings.gist.gistId}`, {
            method: 'PATCH',
            headers: {
              Authorization: 'token ' + gistToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              files: {
                'pm-data.json': { content: JSON.stringify(db) }
              }
            })
          });
          if (!res.ok) throw new Error('Failed to update gist');
          db.userSettings.gist.githubTokenMasked = gistToken.replace(/.(?=.{4})/g, '*');
          saveDB();
          alert('Saved to existing gist');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to save gist');
      }
    });
    actions.appendChild(cancel); actions.appendChild(loadBtn); actions.appendChild(saveBtn);
    content.appendChild(form);
    content.appendChild(actions);
    const overlay = openModal(content);
  }

  /* --------------------------------------------------------------------------
   * Initialize application
   */
  function init() {
    loadDB();
    cacheDOM();
    populateFilters();
    attachNavListeners();
    attachFilterListeners();
    // Attach global button actions
    if (dom.exportPdfBtn) dom.exportPdfBtn.addEventListener('click', exportPdf);
    if (dom.syncGistBtn) dom.syncGistBtn.addEventListener('click', openSyncModal);
    if (dom.newProjectBtn) dom.newProjectBtn.addEventListener('click', () => openProjectModal(null));
    if (dom.newTeamBtn) dom.newTeamBtn.addEventListener('click', () => openTeamModal(null));
    if (dom.newDeliverableBtn) dom.newDeliverableBtn.addEventListener('click', () => openDeliverableModal(null));
    if (dom.newDocumentBtn) dom.newDocumentBtn.addEventListener('click', () => openDocumentModal(null));
    // Default view
    showView('timeline');
    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return; // ignore when typing
      if (e.key === 'n' || e.key === 'N') {
        // New activity
        openActivityModal(null);
      } else if (e.key === 'e' || e.key === 'E') {
        if (uiState.selectedActivityId) {
          openActivityModal(uiState.selectedActivityId);
        }
      } else if (e.key === 'Delete') {
        if (uiState.selectedActivityId) {
          const act = db.activities.find(a => a.id === uiState.selectedActivityId);
          if (act && confirm('Delete this activity?')) {
            db.activities = db.activities.filter(a => a.id !== act.id);
            saveDB();
            renderTimeline();
            renderSummary();
            uiState.selectedActivityId = null;
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Save to gist if enabled
        if (db.userSettings.gist.enabled) {
          openSyncModal();
        } else {
          alert('No sync enabled. Use Sync button.');
        }
      }
    });
  }

  // Wait for DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();