// popup.js

// === Constants & Setup ===
const menuBtn = document.getElementById('menuBtn');
const optionsPanel = document.getElementById('optionsPanel');

const STORAGE_KEYS = {
  SETTINGS: 'pomodoroSettings',
  SESSIONS: 'pomodoroSessions'
};

// State (Local mirrors of background state)
let analyticsFilter = 'day';

// DOM Elements
const timerDisplay = document.getElementById('timer');
const phaseLabel = document.getElementById('phaseLabel');
const progressDots = document.getElementById('progressDots');
const sessionTypeEl = document.getElementById('sessionType');
const sessionCountDisplay = document.getElementById('sessionCountDisplay');

const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');

const focusInput = document.getElementById('focusDurationInput');
const breakInput = document.getElementById('breakDurationInput');
const sessionInput = document.getElementById('sessionCountInput');

const totalTimeEl = document.getElementById('totalTime');
const sessionsCompletedEl = document.getElementById('sessionsCompleted');
const statBarFill = document.getElementById('statBarFill');
const syncIndicator = document.getElementById('syncIndicator');

const toast = document.getElementById('toast');
const analyticsTabs = document.querySelectorAll('.analytics-tab');
const exportBtn = document.getElementById('exportBtn');

// === 1. Sync & Communication Logic ===

// Helper to format 00:00
function formatTime(m, s) {
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Function to update the UI based on data from background.js
function updateUI(state) {
  if (!state) return;

  // Time & Labels
  timerDisplay.textContent = formatTime(state.minutes, state.seconds);
  phaseLabel.textContent = state.phase === 'focus' ? 'Focus' : 'Break';
  sessionTypeEl.textContent = state.phase === 'focus' ? 'Focus Session' : 'Break Time';
  sessionCountDisplay.textContent = `${state.sessionCount} of ${state.totalSessions}`;

  // Button States
  if (state.isRunning) {
    playPauseBtn.classList.add('primary');
    playPauseBtn.innerHTML = '&#10074;&#10074;'; // Pause icon
    timerDisplay.classList.add('running');
  } else {
    playPauseBtn.classList.remove('primary');
    playPauseBtn.innerHTML = '&#9658;'; // Play icon
    timerDisplay.classList.remove('running');
  }

  // Progress Dots
  renderProgressDots(state.sessionCount, state.totalSessions);
}

// Poll the background script every second to keep UI updated
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
    updateUI(response);
  });
}, 1000);

// Initialize on load
chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
  updateUI(response);
  loadSettingsUI(); // Fill inputs with stored values
  updateAnalytics();
});

// === 2. Control Buttons (Sending Commands) ===

playPauseBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (state) => {
    const action = state.isRunning ? 'STOP' : 'START';
    chrome.runtime.sendMessage({ action: action }, (newState) => {
      updateUI(newState);
      // Play sound effect locally for immediate feedback
      playClickSound(); 
    });
  });
});

resetBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'RESET' }, (newState) => {
    updateUI(newState);
  });
});

// === 3. Visual Helpers ===

function renderProgressDots(current, total) {
  progressDots.innerHTML = '';
  // Connector line is handled in CSS via ::before
  for (let i = 1; i <= total; i++) {
    const dot = document.createElement('div');
    let className = 'dot';
    if (i < current) className += ' completed';
    else if (i === current) className += ' active';
    else className += ' upcoming';
    
    dot.className = className;
    progressDots.appendChild(dot);
  }
}

function showSyncStatus() {
  syncIndicator.classList.add('saving');
  syncIndicator.querySelector('.sync-text').textContent = 'Saving...';
  setTimeout(() => {
    syncIndicator.classList.remove('saving');
    syncIndicator.querySelector('.sync-text').textContent = 'Saved';
  }, 800);
}

// Simple Click Sound (AudioContext)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClickSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 600;
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.1);
}

// === 4. Settings & Steppers Logic ===

function loadSettingsUI() {
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (res) => {
    if (res[STORAGE_KEYS.SETTINGS]) {
      const s = res[STORAGE_KEYS.SETTINGS];
      focusInput.value = s.focusDuration || 25;
      breakInput.value = s.breakDuration || 5;
      sessionInput.value = s.sessionCount || 4;
      
      // Sync these loaded settings to background immediately
      notifyBackgroundSettingsChange();
    }
  });
}

function saveSettingsToStorage() {
  const settings = {
    focusDuration: parseInt(focusInput.value),
    breakDuration: parseInt(breakInput.value),
    sessionCount: parseInt(sessionInput.value)
  };
  chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  notifyBackgroundSettingsChange();
  showSyncStatus();
}

function notifyBackgroundSettingsChange() {
  chrome.runtime.sendMessage({
    action: 'UPDATE_SETTINGS',
    payload: {
      focus: parseInt(focusInput.value),
      break: parseInt(breakInput.value),
      sessions: parseInt(sessionInput.value)
    }
  }, (response) => updateUI(response));
}

// Stepper Event Listeners
document.querySelectorAll('.stepper-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const action = e.currentTarget.dataset.action; // 'increase' or 'decrease'
    const target = e.currentTarget.dataset.target; // 'focus', 'break', 'sessions'
    const inputMap = {
      'focus': focusInput,
      'break': breakInput,
      'sessions': sessionInput
    };
    const input = inputMap[target];
    let val = parseInt(input.value);

    // Update Value
    if (action === 'increase') val++;
    else val--;

    // Clamp Values
    if (target === 'focus') val = Math.max(1, Math.min(60, val));
    if (target === 'break') val = Math.max(1, Math.min(30, val));
    if (target === 'sessions') val = Math.max(1, Math.min(12, val));

    input.value = val;
    saveSettingsToStorage();
  });
});

// === 5. Analytics Logic ===

function isSameDay(d1, d2) {
  return d1.getDate() === d2.getDate() && 
         d1.getMonth() === d2.getMonth() && 
         d1.getFullYear() === d2.getFullYear();
}

function updateAnalytics() {
  chrome.storage.local.get([STORAGE_KEYS.SESSIONS], (res) => {
    const sessions = res[STORAGE_KEYS.SESSIONS] || [];
    const now = new Date();
    
    // Filter sessions based on current filter (simplified for 'day' vs others)
    let filtered = sessions.filter(entry => {
      const d = new Date(entry.date);
      if (analyticsFilter === 'day') return isSameDay(d, now);
      // Add week/month logic here if needed
      return true; 
    });

    let totalSeconds = filtered.reduce((sum, e) => sum + e.focusDuration, 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    totalTimeEl.textContent = `${hours}h ${minutes}m`;
    sessionsCompletedEl.textContent = filtered.length.toString();

    // Visual Bar (Goal: 4 hours)
    const goalSeconds = 4 * 3600;
    const pct = Math.min((totalSeconds / goalSeconds) * 100, 100);
    statBarFill.style.width = `${pct}%`;
  });
}

// Analytics Tabs
analyticsTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    analyticsTabs.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    analyticsFilter = tab.getAttribute('data-filter');
    updateAnalytics();
  });
});

// Menu Toggle
menuBtn.addEventListener('click', () => {
  optionsPanel.classList.toggle('hidden');
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); playPauseBtn.click(); }
  if (e.code === 'KeyR') { e.preventDefault(); resetBtn.click(); }
  if (e.code === 'KeyS') { e.preventDefault(); menuBtn.click(); }
  if (e.code === 'Escape') { optionsPanel.classList.add('hidden'); }
});