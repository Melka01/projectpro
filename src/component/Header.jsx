import React from 'react';

const viewTitles = {
  timeline: {
    title: 'Timeline View',
    subtitle: 'Visualize your project schedule'
  },
  projects: {
    title: 'Projects',
    subtitle: 'Manage your projects and deliverables'
  },
  team: {
    title: 'Team Members',
    subtitle: 'Manage your team roster'
  },
  deliverables: {
    title: 'Deliverables',
    subtitle: 'Manage the deliverables catalog'
  },
  documents: {
    title: 'Documents',
    subtitle: 'Manage document library'
  },
  reports: {
    title: 'Reports',
    subtitle: 'Generate and export reports'
  }
};

export default function Header({ currentView }) {
  const viewInfo = viewTitles[currentView] || { title: 'Unknown View', subtitle: '' };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{viewInfo.title}</h2>
          <p className="text-gray-600 mt-1">{viewInfo.subtitle}</p>
        </div>
        
        {currentView === 'timeline' && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Export:</label>
              <button className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors">
                PDF
              </button>
              <button className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 transition-colors">
                Sync
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
