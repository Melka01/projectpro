import React from 'react';

const navItems = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'projects', label: 'Projects' },
  { id: 'team', label: 'Team Members' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'documents', label: 'Documents' },
  { id: 'reports', label: 'Reports' }
];

export default function Sidebar({ currentView, onViewChange }) {
  return (
    <aside className="w-sidebar bg-sidebar-bg border-r border-gray-200 flex flex-col">
      <div className="p-6">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-brand-primary rounded-card mr-3"></div>
          <h1 className="text-xl font-bold text-brand-dark">PM Timeline</h1>
        </div>
      </div>
      
      <nav className="flex-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center px-6 py-3 text-left font-medium transition-colors relative ${
              currentView === item.id
                ? 'text-brand-dark bg-white border-r-2 border-brand-primary'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
