import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Timeline from './components/Timeline';
import ProjectForm from './components/ProjectForm';
import DebugPanel from './components/DebugPanel';
import { AppProvider, useApp } from './utils/AppContext';
import { logger } from './utils/logging';
import { getFeatureFlag } from './utils/flags';
import './index.css';

function AppContent() {
  const { state, dispatch } = useApp();
  const [currentView, setCurrentView] = useState('timeline');
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  useEffect(() => {
    // Check for debug flag in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === '1' || getFeatureFlag('showDebugPanel')) {
      setShowDebugPanel(true);
    }
  }, []);

  useEffect(() => {
    logger.info('App initialized', { view: currentView });
  }, [currentView]);

  const activeProjects = state.projects.filter(p => p.status === 'Active');

  const renderMainView = () => {
    switch (currentView) {
      case 'timeline':
        return <Timeline projects={activeProjects} />;
      case 'projects':
        return <ProjectForm />;
      default:
        return <div className="p-6">View not implemented yet</div>;
    }
  };

  return (
    <div className="flex h-screen bg-surface-subtle">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header currentView={currentView} />
        <main className="flex-1 overflow-auto">
          {renderMainView()}
        </main>
      </div>
      {showDebugPanel && (
        <DebugPanel 
          onClose={() => setShowDebugPanel(false)}
          currentView={currentView}
          activeProjects={activeProjects}
        />
      )}
      {/* Debug toggle button */}
      <button
        onClick={() => setShowDebugPanel(!showDebugPanel)}
        className="fixed bottom-4 right-4 z-50 bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
        title="Toggle debug panel"
      >
        🐛
      </button>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
