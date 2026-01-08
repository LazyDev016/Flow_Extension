// popup.js

const elements = {
  timerDisplay: document.getElementById('timerDisplay'),
  phaseLabel: document.getElementById('phaseLabel'),
  sessionType: document.getElementById('sessionType'),
  sessionCountDisplay: document.getElementById('sessionCountDisplay'),
  progressDots: document.getElementById('progressDots'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  menuBtn: document.getElementById('menuBtn'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  
  focusInput: document.getElementById('focusInput'),
  breakInput: document.getElementById('breakInput'),
  sessionInput: document.getElementById('sessionInput'),
  
  totalTime: document.getElementById('totalTime'),
  statFill: document.getElementById('statFill'),
  exportBtn: document.getElementById('exportBtn'),
  tabs: document.querySelectorAll('.tab-btn'),
  
  toast: document.getElementById('toast')
};

const ICONS = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
};

let currentFilter = 'day';

function formatTime(ms) {
  const totalSecs = Math.ceil(ms / 1000);
  const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const s = (totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateUI(state) {
  if (!state) return;

  // Time
  let displayMs = state.remainingTime;
  if (state.isRunning && state.targetTime) {
    displayMs = Math.max(0, state.targetTime - Date.now());
  }

  elements.timerDisplay.textContent = formatTime(displayMs);
  
  if (state.isRunning) {
    elements.timerDisplay.classList.add('running');
    elements.playPauseBtn.classList.add('running'); // Specific for padding CSS
  } else {
    elements.timerDisplay.classList.remove('running');
    elements.playPauseBtn.classList.remove('running');
  }
  
  if (state.phase === 'break') elements.timerDisplay.classList.add('break');
  else elements.timerDisplay.classList.remove('break');

  // Labels
  elements.phaseLabel.textContent = state.phase === 'focus' ? 'FOCUS' : 'BREAK';
  elements.sessionType.textContent = state.phase === 'focus' ? 'Focus Session' : 'Break Time';
  elements.sessionCountDisplay.textContent = `${state.sessionCount} of ${state.settings.sessions}`;

  // Icons
  elements.playPauseBtn.innerHTML = state.isRunning ? ICONS.pause : ICONS.play;

  // Dots
  renderDots(state.sessionCount, state.settings.sessions);
}

function renderDots(current, total) {
  elements.progressDots.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    let cls = 'dot';
    if (i < current) cls += ' completed';
    else if (i === current) cls += ' active';
    dot.className = cls;
    elements.progressDots.appendChild(dot);
  }
}

// --- INIT ---
function init() {
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (state) => {
    updateUI(state);
    if(state) {
      elements.focusInput.value = state.settings.focus;
      elements.breakInput.value = state.settings.break;
      elements.sessionInput.value = state.settings.sessions;
    }
    updateAnalytics();
  });

  setInterval(() => {
    chrome.storage.local.get(['timerState'], (res) => {
      if(res.timerState) updateUI(res.timerState);
    });
  }, 1000);
}

// --- CONTROLS ---
elements.playPauseBtn.addEventListener('click', () => {
  chrome.storage.local.get(['timerState'], (res) => {
    const s = res.timerState;
    const action = (s && s.isRunning) ? 'PAUSE' : 'START';
    chrome.runtime.sendMessage({ action: action }, (newState) => updateUI(newState));
  });
});

elements.resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' }, (newState) => updateUI(newState));
});

// Settings Overlay Logic
elements.menuBtn.addEventListener('click', () => {
  elements.settingsPanel.classList.add('active');
  updateAnalytics();
});
elements.closeSettingsBtn.addEventListener('click', () => {
  elements.settingsPanel.classList.remove('active');
});

// Steppers
document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = e.currentTarget.dataset.action;
    const target = e.currentTarget.dataset.target;
    
    const inputMap = { focus: elements.focusInput, break: elements.breakInput, sessions: elements.sessionInput };
    const input = inputMap[target];
    let val = parseInt(input.value);
    
    if (action === 'inc') val++; else val--;
    val = Math.max(1, val);
    if (target !== 'sessions') val = Math.min(60, val); else val = Math.min(12, val);
    
    input.value = val;
    
    const newSettings = {
      focus: parseInt(elements.focusInput.value),
      break: parseInt(elements.breakInput.value),
      sessions: parseInt(elements.sessionInput.value)
    };
    chrome.runtime.sendMessage({ action: 'UPDATE_SETTINGS', payload: newSettings }, (s) => updateUI(s));
    
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2000);
  });
});

// --- ANALYTICS ---
function isSameDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && 
         d1.getMonth() === d2.getMonth() && 
         d1.getDate() === d2.getDate();
}

function updateAnalytics() {
  chrome.storage.local.get(['flowHistory'], (res) => {
    const history = res.flowHistory || [];
    const now = new Date();
    
    const filtered = history.filter(s => {
      const d = new Date(s.date);
      if (currentFilter === 'day') return isSameDate(d, now);
      if (currentFilter === 'month') return d.getMonth() === now.getMonth();
      if (currentFilter === 'week') return (now - d) < (7 * 24 * 60 * 60 * 1000);
      return true;
    });
    
    const totalMin = filtered.reduce((acc, curr) => acc + (curr.duration || 0), 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    
    elements.totalTime.textContent = `${h}h ${m}m`;
    const pct = Math.min(100, (totalMin / 240) * 100);
    elements.statFill.style.width = `${pct}%`;
  });
}

elements.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    elements.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    updateAnalytics();
  });
});

elements.exportBtn.addEventListener('click', () => {
  chrome.storage.local.get(['flowHistory'], (res) => {
    const history = res.flowHistory || [];
    if (!history.length) return;
    
    let csv = "Date,Duration (min)\n";
    history.forEach(s => {
      csv += `${new Date(s.date).toLocaleString()},${s.duration}\n`;
    });
    
    const url = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'flow_data.csv';
    link.click();
  });
});

init();