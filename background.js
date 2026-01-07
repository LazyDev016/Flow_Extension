// background.js

// Initial State
let timerState = {
  minutes: 25,
  seconds: 0,
  isRunning: false,
  phase: 'focus', // 'focus' or 'break'
  sessionCount: 1,
  totalSessions: 4,
  focusDuration: 25,
  breakDuration: 5
};

let timerInterval = null;

// === Timer Logic ===

function startTimer() {
  if (timerState.isRunning) return;
  timerState.isRunning = true;
  
  timerInterval = setInterval(() => {
    if (timerState.seconds > 0) {
      timerState.seconds--;
    } else if (timerState.minutes > 0) {
      timerState.minutes--;
      timerState.seconds = 59;
    } else {
      handleTimerComplete();
    }
  }, 1000);
}

function stopTimer() {
  timerState.isRunning = false;
  clearInterval(timerInterval);
}

function resetTimer() {
  stopTimer();
  timerState.phase = 'focus';
  timerState.minutes = timerState.focusDuration;
  timerState.seconds = 0;
  timerState.sessionCount = 1;
}

function handleTimerComplete() {
  // 1. Play notification
  const title = timerState.phase === 'focus' ? 'Focus Complete!' : 'Break Over!';
  const message = timerState.phase === 'focus' ? 'Time for a break.' : 'Back to work!';
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png', // Ensure you have an icon.png in your folder
    title: 'Flow',
    message: message,
    priority: 2
  });

  // 2. Switch Phase
  if (timerState.phase === 'focus') {
    timerState.phase = 'break';
    timerState.minutes = timerState.breakDuration;
    timerState.seconds = 0;
    // Save session data here (optional integration point)
  } else {
    timerState.phase = 'focus';
    timerState.minutes = timerState.focusDuration;
    timerState.seconds = 0;
    timerState.sessionCount++;
    
    if (timerState.sessionCount > timerState.totalSessions) {
      stopTimer();
      timerState.sessionCount = 1; // Reset or mark complete
      return; 
    }
  }
}

// === Message Listener (The Interface) ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_STATUS') {
    sendResponse(timerState);
  } 
  else if (request.action === 'START') {
    startTimer();
    sendResponse(timerState);
  } 
  else if (request.action === 'STOP') {
    stopTimer();
    sendResponse(timerState);
  } 
  else if (request.action === 'RESET') {
    resetTimer();
    sendResponse(timerState);
  } 
  else if (request.action === 'UPDATE_SETTINGS') {
    // Update internal state settings
    timerState.focusDuration = request.payload.focus;
    timerState.breakDuration = request.payload.break;
    timerState.totalSessions = request.payload.sessions;
    
    // If stopped, update the display time immediately
    if (!timerState.isRunning && timerState.phase === 'focus') {
      timerState.minutes = timerState.focusDuration;
      timerState.seconds = 0;
    } else if (!timerState.isRunning && timerState.phase === 'break') {
      timerState.minutes = timerState.breakDuration;
      timerState.seconds = 0;
    }
    sendResponse(timerState);
  }
});