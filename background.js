// background.js

const DEFAULT_STATE = {
  isRunning: false,
  targetTime: null,
  remainingTime: 25 * 60 * 1000,
  phase: 'focus',
  sessionCount: 1,
  totalSessions: 4,
  settings: { focus: 25, break: 5, sessions: 4 }
};

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['timerState', 'pomodoroSessions'], (res) => {
    if (!res.timerState) chrome.storage.local.set({ timerState: DEFAULT_STATE });
    if (!res.pomodoroSessions) chrome.storage.local.set({ pomodoroSessions: [] });
  });
});

// --- ALARM HANDLER (The Auto-Pilot) ---
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flowTimerEnd') {
    handleTimerComplete();
  }
});

function handleTimerComplete() {
  chrome.storage.local.get(['timerState', 'pomodoroSessions'], (res) => {
    let state = res.timerState || DEFAULT_STATE;
    let history = res.pomodoroSessions || [];

    // --- STEP 1: CALCULATE NEXT STATE (CRITICAL LOGIC) ---
    const wasFocus = state.phase === 'focus';
    
    // 1. Record Data (If Focus finished)
    if (wasFocus) {
      history.push({
        date: Date.now(),
        durationMinutes: state.settings.focus
      });
    }

    // 2. Determine Next Phase
    let nextPhase = wasFocus ? 'break' : 'focus';
    let nextDuration = wasFocus ? state.settings.break : state.settings.focus;
    
    // 3. Update Session Counts
    if (!wasFocus) {
      // Break just finished, increment session
      state.sessionCount++;
      if (state.sessionCount > state.settings.sessions) {
        state.sessionCount = 1; 
      }
    }

    // 4. Set Next Target Time (Auto-Start)
    const nextDurationMs = nextDuration * 60 * 1000;
    const now = Date.now();
    const newTarget = now + nextDurationMs;

    const newState = {
      ...state,
      phase: nextPhase,
      remainingTime: nextDurationMs,
      targetTime: newTarget,
      isRunning: true 
    };

    // --- STEP 2: SAVE TO DISK IMMEDIATELY ---
    // We save BEFORE notifying, so if notification crashes, the timer is still safe.
    chrome.storage.local.set({ 
      timerState: newState,
      pomodoroSessions: history
    });

    // --- STEP 3: SET NEXT ALARM ---
    chrome.alarms.create('flowTimerEnd', { when: newTarget });

    // --- STEP 4: USER FEEDBACK (Audio/Visual) ---
    const msg = wasFocus ? 'Focus complete. Starting break.' : 'Break over. Focus time.';
    
    // Audio (Reliable TTS)
    chrome.tts.speak(msg, { rate: 1.0, lang: 'en-US' });

    // Visual (Wrapped in try/catch to prevent crashes)
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png', // If this is missing, it won't crash the app now
        title: 'Flow',
        message: msg,
        priority: 2,
        requireInteraction: false
      });
    } catch (e) {
      console.warn("Notification failed:", e);
    }
  });
}

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  chrome.storage.local.get(['timerState'], (res) => {
    let state = res.timerState || DEFAULT_STATE;

    if (req.action === 'START') {
      if (!state.isRunning) {
        const now = Date.now();
        // If remainingTime is 0 (glitch), reset to default duration for current phase
        if (state.remainingTime <= 0) {
           const dur = state.phase === 'focus' ? state.settings.focus : state.settings.break;
           state.remainingTime = dur * 60 * 1000;
        }
        
        const target = now + state.remainingTime;
        state.isRunning = true;
        state.targetTime = target;
        
        chrome.alarms.create('flowTimerEnd', { when: target });
        chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
      } else {
        sendResponse(state);
      }
    } 
    else if (req.action === 'STOP') {
      if (state.isRunning) {
        const now = Date.now();
        const left = Math.max(0, state.targetTime - now);
        state.isRunning = false;
        state.remainingTime = left;
        state.targetTime = null;
        chrome.alarms.clear('flowTimerEnd');
        chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
      } else {
        sendResponse(state);
      }
    } 
    else if (req.action === 'RESET') {
      chrome.alarms.clear('flowTimerEnd');
      state.isRunning = false;
      state.phase = 'focus';
      state.remainingTime = state.settings.focus * 60 * 1000;
      state.sessionCount = 1;
      chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
    }
    else if (req.action === 'UPDATE_SETTINGS') {
      state.settings = req.payload;
      if (!state.isRunning) {
        const dur = state.phase === 'focus' ? state.settings.focus : state.settings.break;
        state.remainingTime = dur * 60 * 1000;
      }
      chrome.storage.local.set({ timerState: state }, () => sendResponse(state));
    }
    else if (req.action === 'GET_STATUS') {
      sendResponse(state);
    }
  });
  return true;
});