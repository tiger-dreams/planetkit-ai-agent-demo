import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Filter SIP.js console logs
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = function(...args: any[]) {
  const message = args.join(' ');
  // Filter SIP-related logs
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
