/**
 * Lightweight logging utility with levels and memory storage
 */
class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 200; // Keep last 200 log entries
    this.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  }

  setLevel(level) {
    this.level = level;
  }

  log(level, message, context = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    // Add to memory store
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output based on level
    const shouldLog = this.shouldLog(level);
    if (shouldLog) {
      const logMethod = this.getConsoleMethod(level);
      if (context) {
        logMethod(`[${level.toUpperCase()}] ${message}`, context);
      } else {
        logMethod(`[${level.toUpperCase()}] ${message}`);
      }
    }
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.level];
  }

  getConsoleMethod(level) {
    switch (level) {
      case 'debug': return console.debug;
      case 'info': return console.info;
      case 'warn': return console.warn;
      case 'error': return console.error;
      default: return console.log;
    }
  }

  debug(message, context) {
    this.log('debug', message, context);
  }

  info(message, context) {
    this.log('info', message, context);
  }

  warn(message, context) {
    this.log('warn', message, context);
  }

  error(message, context) {
    this.log('error', message, context);
  }

  getHistory() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();

export const getLogHistory = () => logger.getHistory();

export const clearLogs = () => logger.clear();
