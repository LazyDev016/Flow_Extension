// popup.js

// === DOM ELEMENTS ===
const timerDisplay = document.getElementById('timer');
const phaseLabel = document.getElementById('phaseLabel');
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const progressDots = document.getElementById('progressDots');
const menuBtn = document.getElementById('menuBtn');
const optionsPanel = document.getElementById('optionsPanel');

// Inputs
const focusInput = document.getElementById('focusDurationInput');
const breakInput = document.getElementById('breakDurationInput');
const sessionInput = document.getElementById('sessionCountInput');

// Analytics
const totalTimeEl = document.getElementById('totalTime');
const sessionsCompletedEl = document.getElementById('sessionsCompleted');
const exportBtn = document.getElementById('exportBtn');
const analyticsTabs = document.querySelectorAll('.analytics-tab');
let currentFilter = 'day';

// === 1. TIMER UI LOGIC ===
function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateUI(state) {
  if (!state) return;

  // Calculate Time
  let displayMs = state.remainingTime;
  if (state.isRunning && state.targetTime) {
    displayMs = Math.max(0, state.targetTime - Date.now());
  }

  // Update Text
  timerDisplay.textContent = formatTime(displayMs);
  phaseLabel.textContent = state.phase === 'focus' ? 'FOCUS' : 'BREAK';
  
  // Update Context
  const contextEl = document.querySelector('.timer-context');
  if (contextEl) {
    const txt = state.phase === 'focus' ? 'Focus Session' : 'Break';
    contextEl.textContent = `${txt} • ${state.sessionCount} of ${state.settings.sessions}`;
  }

  // Button State
  if (state.isRunning) {
    // Pause Icon
    playPauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    timerDisplay.classList.add('running');
  } else {
    // Play Icon
    playPauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    timerDisplay.classList.remove('running');
  }
  
  renderDots(state.sessionCount, state.settings.sessions);
}

function renderDots(current, total) {
  if (!progressDots) return;
  progressDots.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    let cls = 'dot';
    if (i < current) cls += ' completed';
    else if (i === current) cls += ' active';
    dot.className = cls;
    progressDots.appendChild(dot);
  }
}

// === 2. ANALYTICS LOGIC ===
function isSameDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function filterSessions(sessions, filter) {
  const now = new Date();
  
  return sessions.filter(s => {
    // Guard against bad data
    if (!s.date) return false;
    
    const date = new Date(s.date);
    
    if (filter === 'day') {
      return isSameDate(date, now);
    }
    if (filter === 'week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= oneWeekAgo;
    }
    if (filter === 'month') {
      return date.getMonth() === now.getMonth() && 
             date.getFullYear() === now.getFullYear();
    }
    if (filter === 'year') {
      return date.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

function updateAnalytics() {
  chrome.storage.local.get(['pomodoroSessions'], (res) => {
    const sessions = res.pomodoroSessions || [];
    const filtered = filterSessions(sessions, currentFilter);

    // Calculate Stats
    const totalMinutes = filtered.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    // Update DOM
    if (totalTimeEl) totalTimeEl.textContent = `${hours}h ${mins}m`;
    if (sessionsCompletedEl) sessionsCompletedEl.textContent = filtered.length;
  });
}

// Tab Switching logic
analyticsTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    analyticsTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const text = tab.textContent.toLowerCase().trim();
    currentFilter = text;
    updateAnalytics();
  });
});

// === 3. EXPORT LOGIC ===
exportBtn.addEventListener('click', () => {
  chrome.storage.local.get(['pomodoroSessions'], (res) => {
    const sessions = res.pomodoroSessions || [];
    if (sessions.length === 0) {
      alert("No data to export.");
      return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,Date,Time,Duration (Minutes)\n";
    sessions.forEach(s => {
      const d = new Date(s.date);
      csvContent += `${d.toLocaleDateString()},${d.toLocaleTimeString()},${s.durationMinutes}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "flow_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});

// === 4. MAIN LOOPS ===
// Update UI fast
setInterval(() => {
  chrome.storage.local.get(['timerState'], (res) => {
    if (res.timerState) updateUI(res.timerState);
  });
}, 1000);

// Init
chrome.storage.local.get(['timerState'], (res) => {
  if (res.timerState) {
    updateUI(res.timerState);
    if(focusInput) focusInput.value = res.timerState.settings.focus;
    if(breakInput) breakInput.value = res.timerState.settings.break;
    if(sessionInput) sessionInput.value = res.timerState.settings.sessions;
  } else {
    chrome.runtime.sendMessage({ action: 'GET_STATUS' });
  }
  updateAnalytics();
});

// === 5. LISTENERS ===
playPauseBtn.addEventListener('click', () => {
  chrome.storage.local.get(['timerState'], (res) => {
    const s = res.timerState;
    const action = (s && s.isRunning) ? 'STOP' : 'START';
    chrome.runtime.sendMessage({ action: action }, (newState) => updateUI(newState));
  });
});

resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' }, (newState) => updateUI(newState));
});

menuBtn.addEventListener('click', () => {
  optionsPanel.classList.toggle('hidden');
  if (!optionsPanel.classList.contains('hidden')) updateAnalytics();
});

document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = e.currentTarget.dataset.action;
    const target = e.currentTarget.dataset.target;
    
    const input = target === 'focus' ? focusInput : 
                  target === 'break' ? breakInput : sessionInput;
                  
    let val = parseInt(input.value);
    if (action === 'increase') val++; else val--;
    
    val = Math.max(1, val);
    if (target !== 'sessions') val = Math.min(60, val);
    else val = Math.min(12, val);

    input.value = val;

    chrome.runtime.sendMessage({
      action: 'UPDATE_SETTINGS',
      payload: {
        focus: parseInt(focusInput.value),
        break: parseInt(breakInput.value),
        sessions: parseInt(sessionInput.value)
      }
    }, (newState) => updateUI(newState));
  });
});