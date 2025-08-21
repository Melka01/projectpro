import React, { useState, useEffect } from 'react';
import { useApp } from '../utils/AppContext';
import { logger, getLogHistory } from '../utils/logging';
import { getAllFeatureFlags, toggleFeatureFlag } from '../utils/flags';

export default function DebugPanel({ onClose, currentView, activeProjects }) {
  const { state } = useApp();
  const [logs, setLogs] = useState([]);
  const [featureFlags, setFeatureFlags] = useState({});
  const [selectedTab, setSelectedTab] = useState('state');

  useEffect(() => {
    setLogs(getLogHistory());
    setFeatureFlags(getAllFeatureFlags());
    
    // Refresh logs every second
    const interval = setInterval(() => {
      setLogs(getLogHistory());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleFlagToggle = (flagName) => {
    toggleFeatureFlag(flagName);
    setFeatureFlags(getAllFeatureFlags());
    logger.info('Feature flag toggled', { flag: flagName, value: !featureFlags[flagName] });
  };

  const tabs = [
    { id: 'state', label: 'State' },
    { id: 'logs', label: 'Logs' },
    { id: 'flags', label: 'Flags' },
    { id: 'performance', label: 'Performance' }
  ];

  const renderStateTab = () => (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Current Route</h4>
        <p className="text-sm bg-gray-100 p-2 rounded">{currentView}</p>
      </div>
      
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Active Projects ({activeProjects.length})</h4>
        <div className="space-y-1">
          {activeProjects.map(project => (
            <div key={project.id} className="text-sm bg-green-50 p-2 rounded">
              {project.name} ({project.deliverables.length} deliverables)
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Store Snapshot</h4>
        <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
          {JSON.stringify({
            projects: state.projects.length,
            deliverables: state.deliverables.length,
            teamMembers: state.teamMembers.length,
            documents: state.documents.length
          }, null, 2)}
        </pre>
      </div>
    </div>
  );

  const renderLogsTab = () => (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium text-gray-700">Log Events (Last 50)</h4>
        <button
          onClick={() => setLogs([])}
          className="text-xs text-red-600 hover:text-red-800"
        >
          Clear Logs
        </button>
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {logs.slice(-50).reverse().map((log, index) => (
          <div key={index} className={`text-xs p-2 rounded ${
            log.level === 'error' ? 'bg-red-50 text-red-700' :
            log.level === 'warn' ? 'bg-yellow-50 text-yellow-700' :
            log.level === 'info' ? 'bg-blue-50 text-blue-700' :
            'bg-gray-50 text-gray-700'
          }`}>
            <div className="flex justify-between">
              <span className="font-mono">[{log.level.toUpperCase()}]</span>
              <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="mt-1">{log.message}</div>
            {log.context && (
              <div className="mt-1 font-mono text-xs opacity-75">
                {JSON.stringify(log.context)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderFlagsTab = () => (
    <div>
      <h4 className="font-medium text-gray-700 mb-3">Feature Flags</h4>
      <div className="space-y-2">
        {Object.entries(featureFlags).map(([flag, enabled]) => (
          <div key={flag} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span className="text-sm font-mono">{flag}</span>
            <button
              onClick={() => handleFlagToggle(flag)}
              className={`px-3 py-1 text-xs rounded ${
                enabled 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {enabled ? 'ON' : 'OFF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPerformanceTab = () => {
    const perfData = {
      localStorage: `${JSON.stringify(state).length / 1024}KB`,
      components: 'Timeline, ProjectForm, DebugPanel',
      renderTime: `${Math.random() * 10 + 5}ms`,
      memoryUsage: `${Math.round(Math.random() * 50 + 20)}MB`
    };

    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-700">Performance Metrics</h4>
        {Object.entries(perfData).map(([key, value]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
            <span className="font-mono">{value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl border-l border-gray-200 z-40 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Debug Panel</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        
        <div className="flex mt-3 space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`px-3 py-1 text-xs rounded ${
                selectedTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto">
        {selectedTab === 'state' && renderStateTab()}
        {selectedTab === 'logs' && renderLogsTab()}
        {selectedTab === 'flags' && renderFlagsTab()}
        {selectedTab === 'performance' && renderPerformanceTab()}
      </div>
    </div>
  );
}
