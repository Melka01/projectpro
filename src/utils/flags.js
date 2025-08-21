/**
 * Simple feature flag system for development and testing
 */
const DEFAULT_FLAGS = {
  showDebugPanel: false,
  enableTimelineTooltips: true,
  enableDeliverableComments: true,
  enableWorkLogTracking: true,
  enableAdvancedFiltering: false,
  enableBulkOperations: false,
  enableExportFeatures: true,
  enableGistSync: true
};

class FeatureFlags {
  constructor() {
    this.flags = { ...DEFAULT_FLAGS };
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('feature-flags');
      if (stored) {
        const parsedFlags = JSON.parse(stored);
        this.flags = { ...DEFAULT_FLAGS, ...parsedFlags };
      }
    } catch (error) {
      console.warn('Failed to load feature flags from storage:', error);
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('feature-flags', JSON.stringify(this.flags));
    } catch (error) {
      console.warn('Failed to save feature flags to storage:', error);
    }
  }

  get(flagName) {
    // Check URL override first
    const urlParams = new URLSearchParams(window.location.search);
    const urlOverride = urlParams.get(`flag_${flagName}`);
    if (urlOverride !== null) {
      return urlOverride === '1' || urlOverride === 'true';
    }

    // Check environment variable override
    const envOverride = process.env[`REACT_APP_FLAG_${flagName.toUpperCase()}`];
    if (envOverride !== undefined) {
      return envOverride === '1' || envOverride === 'true';
    }

    // Return stored value or default
    return this.flags[flagName] !== undefined ? this.flags[flagName] : false;
  }

  set(flagName, value) {
    this.flags[flagName] = Boolean(value);
    this.saveToStorage();
  }

  toggle(flagName) {
    const currentValue = this.get(flagName);
    this.set(flagName, !currentValue);
    return !currentValue;
  }

  getAll() {
    const result = {};
    for (const flagName of Object.keys(DEFAULT_FLAGS)) {
      result[flagName] = this.get(flagName);
    }
    return result;
  }

  reset() {
    this.flags = { ...DEFAULT_FLAGS };
    this.saveToStorage();
  }

  addFlag(flagName, defaultValue = false) {
    if (!(flagName in this.flags)) {
      this.flags[flagName] = defaultValue;
      this.saveToStorage();
    }
  }
}

const featureFlags = new FeatureFlags();

export const getFeatureFlag = (flagName) => featureFlags.get(flagName);
export const setFeatureFlag = (flagName, value) => featureFlags.set(flagName, value);
export const toggleFeatureFlag = (flagName) => featureFlags.toggle(flagName);
export const getAllFeatureFlags = () => featureFlags.getAll();
export const resetFeatureFlags = () => featureFlags.reset();
export const addFeatureFlag = (flagName, defaultValue) => featureFlags.addFlag(flagName, defaultValue);
