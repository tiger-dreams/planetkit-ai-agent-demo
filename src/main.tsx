import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// SIP.js 콘솔 로그 필터링
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = function(...args: any[]) {
  const message = args.join(' ');
  // SIP 관련 로그 필터링
  if (message.includes('sip.') || message.includes('| sip')) {
    return;
  }
  originalLog.apply(console, args);
};

console.warn = function(...args: any[]) {
  const message = args.join(' ');
  if (message.includes('sip.') || message.includes('| sip')) {
    return;
  }
  originalWarn.apply(console, args);
};

console.error = function(...args: any[]) {
  const message = args.join(' ');
  if (message.includes('sip.') || message.includes('| sip')) {
    return;
  }
  originalError.apply(console, args);
};

createRoot(document.getElementById("root")!).render(<App />);
