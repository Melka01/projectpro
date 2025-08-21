import React, { useEffect, useRef, useState } from 'react';
import interact from 'interactjs';
import { useApp } from '../utils/AppContext';
import { logger } from '../utils/logging';

const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
};

const parseDate = (str) => new Date(str + 'T00:00:00');

const addDays = (dateStr, days) => {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

const differenceInDays = (a, b) => {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
};

export default function Timeline({ projects }) {
  const { state, dispatch } = useApp();
  const containerRef = useRef(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Get all deliverable instances from active projects
  const deliverableItems = projects.flatMap(project => 
    project.deliverables.map(projectDeliverable => {
      const deliverable = state.deliverables.find(d => d.id === projectDeliverable.id);
      return {
        id: `${project.id}-${projectDeliverable.id}`,
        projectId: project.id,
        projectName: project.name,
        deliverableId: projectDeliverable.id,
        deliverableName: deliverable?.name || 'Unknown Deliverable',
        startDate: projectDeliverable.startDate,
        endDate: projectDeliverable.endDate,
        comments: projectDeliverable.comments || '',
        workDone: projectDeliverable.workDone || [],
        phase: deliverable?.defaultPhase || 'Discover'
      };
    })
  );

  useEffect(() => {
    if (deliverableItems.length > 0) {
      renderTimeline();
    }
  }, [deliverableItems]);

  const renderTimeline = () => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    if (deliverableItems.length === 0) {
      container.innerHTML = '<p class="p-4 text-gray-500">No deliverables to display for active projects.</p>';
      return;
    }

    // Calculate timeline range
    let minDate = deliverableItems.reduce((min, item) => 
      item.startDate < min ? item.startDate : min, deliverableItems[0].startDate);
    let maxDate = deliverableItems.reduce((max, item) => 
      item.endDate > max ? item.endDate : max, deliverableItems[0].endDate);

    minDate = addDays(minDate, -2);
    maxDate = addDays(maxDate, 2);
    const totalDays = differenceInDays(minDate, maxDate) + 1;

    const viewportWidth = container.clientWidth || 800;
    const minDayWidth = 40;
    const dayWidth = Math.max(viewportWidth / Math.min(totalDays, 30), minDayWidth);
    const timelineWidth = totalDays * dayWidth;

    // Create timeline container
    const inner = document.createElement('div');
    inner.className = 'relative h-full';
    inner.style.width = `${timelineWidth}px`;
    container.appendChild(inner);

    // Add grid lines
    for (let i = 0; i <= totalDays; i += 7) {
      const tick = document.createElement('div');
      tick.className = 'absolute top-0 bottom-0 w-px bg-gray-200';
      tick.style.left = `${i * dayWidth}px`;
      inner.appendChild(tick);
    }

    // Add today line
    const todayStr = formatDate(new Date());
    if (todayStr >= minDate && todayStr <= maxDate) {
      const todayPos = differenceInDays(minDate, todayStr);
      const line = document.createElement('div');
      line.className = 'absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10';
      line.style.left = `${todayPos * dayWidth}px`;
      inner.appendChild(line);
    }

    // Phase colors
    const phaseColors = {
      Discover: 'bg-blue-500',
      Design: 'bg-indigo-500',
      Develop: 'bg-purple-500',
      Drive: 'bg-green-500'
    };

    // Stack items to avoid overlaps
    const rows = [];
    
    deliverableItems.forEach((item, index) => {
      const startIndex = Math.max(0, differenceInDays(minDate, item.startDate));
      const endIndex = Math.max(0, differenceInDays(minDate, item.endDate));
      const duration = endIndex - startIndex + 1;

      // Find available row
      let rowIndex = 0;
      let placed = false;
      for (; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const overlap = row.some(([s, e]) => !(endIndex < s || startIndex > e));
        if (!overlap) {
          row.push([startIndex, endIndex]);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([[startIndex, endIndex]]);
        rowIndex = rows.length - 1;
      }

      // Create deliverable bar
      const bar = document.createElement('div');
      bar.className = `absolute flex items-center h-10 bg-white rounded-lg shadow-md cursor-pointer overflow-hidden hover:shadow-lg transition-shadow`;
      bar.style.left = `${startIndex * dayWidth}px`;
      bar.style.width = `${Math.max(duration * dayWidth, 100)}px`;
      bar.style.top = `${rowIndex * 44}px`;
      bar.dataset.itemId = item.id;
      bar.dataset.startIndex = startIndex;
      bar.dataset.endIndex = endIndex;
      bar.dataset.duration = duration;

      // Phase indicator
      const indicator = document.createElement('div');
      indicator.className = `w-1 h-full ${phaseColors[item.phase] || 'bg-gray-400'}`;
      bar.appendChild(indicator);

      // Content
      const content = document.createElement('div');
      content.className = 'flex items-center flex-1 px-2 min-w-0';
      
      const avatar = document.createElement('div');
      avatar.className = 'w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium mr-2 flex-shrink-0';
      avatar.textContent = item.projectName.substring(0, 2).toUpperCase();
      
      const label = document.createElement('span');
      label.className = 'text-sm font-medium text-gray-900 truncate';
      label.textContent = item.deliverableName;
      
      content.appendChild(avatar);
      content.appendChild(label);
      bar.appendChild(content);

      // Click handler
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedItem(item);
        setShowDetailModal(true);
        logger.info('Deliverable selected', { deliverable: item.deliverableName });
      });

      // Make draggable
      interact(bar)
        .draggable({
          listeners: {
            start(event) {
              bar._origX = parseFloat(bar.style.left);
              bar._origStartIdx = parseInt(bar.dataset.startIndex);
            },
            move(event) {
              const dx = event.dx;
              const newLeft = bar._origX + dx;
              let newStartIdx = Math.round(newLeft / dayWidth);
              newStartIdx = Math.max(0, Math.min(totalDays - duration, newStartIdx));
              bar.style.left = `${newStartIdx * dayWidth}px`;
              bar.dataset.tempStartIndex = newStartIdx;
            },
            end(event) {
              const tmpStart = parseInt(bar.dataset.tempStartIndex);
              if (!isNaN(tmpStart) && tmpStart !== parseInt(bar.dataset.startIndex)) {
                const deltaDays = tmpStart - parseInt(bar.dataset.startIndex);
                updateDeliverableDates(item, deltaDays);
              } else {
                bar.style.left = `${parseInt(bar.dataset.startIndex) * dayWidth}px`;
              }
              delete bar.dataset.tempStartIndex;
            }
          }
        });

      inner.appendChild(bar);
    });

    // Set container height
    inner.style.height = `${Math.max(rows.length * 44, 200)}px`;
  };

  const updateDeliverableDates = (item, deltaDays) => {
    const project = state.projects.find(p => p.id === item.projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      deliverables: project.deliverables.map(pd => 
        pd.id === item.deliverableId ? {
          ...pd,
          startDate: addDays(pd.startDate, deltaDays),
          endDate: addDays(pd.endDate, deltaDays)
        } : pd
      )
    };

    dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
    logger.info('Deliverable dates updated', { 
      deliverable: item.deliverableName, 
      deltaDays 
    });
  };

  const updateDeliverableDetails = (comments, workEntry) => {
    if (!selectedItem) return;

    const project = state.projects.find(p => p.id === selectedItem.projectId);
    if (!project) return;

    const updatedProject = {
      ...project,
      deliverables: project.deliverables.map(pd => 
        pd.id === selectedItem.deliverableId ? {
          ...pd,
          comments,
          workDone: workEntry ? [...(pd.workDone || []), workEntry] : pd.workDone
        } : pd
      )
    };

    dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
    setShowDetailModal(false);
    logger.info('Deliverable details updated', { deliverable: selectedItem.deliverableName });
  };

  return (
    <div className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Project Timeline</h3>
        <p className="text-sm text-gray-500 mt-1">
          Showing {deliverableItems.length} deliverables from {projects.length} active projects
        </p>
      </div>
      
      <div 
        ref={containerRef}
        className="w-full min-h-64 bg-gray-50 border border-gray-200 rounded-card overflow-x-auto"
      />

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <DetailModal 
          item={selectedItem}
          onClose={() => setShowDetailModal(false)}
          onUpdate={updateDeliverableDetails}
        />
      )}
    </div>
  );
}

function DetailModal({ item, onClose, onUpdate }) {
  const [comments, setComments] = useState(item.comments);
  const [workDescription, setWorkDescription] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');

  const handleAddWork = () => {
    if (!workDescription.trim()) return;
    
    const workEntry = {
      id: Date.now().toString(),
      date: formatDate(new Date()),
      description: workDescription,
      hoursSpent: parseFloat(hoursSpent) || 0,
      author: 'Current User'
    };
    
    onUpdate(comments, workEntry);
  };

  const handleUpdateComments = () => {
    onUpdate(comments, null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-semibold">{item.deliverableName}</h3>
              <p className="text-sm text-gray-500">{item.projectName}</p>
              <p className="text-sm text-gray-500">{item.startDate} - {item.endDate}</p>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Add comments about this deliverable..."
              />
              <button
                onClick={handleUpdateComments}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Update Comments
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Work Done
              </label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Describe work completed..."
              />
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  value={hoursSpent}
                  onChange={(e) => setHoursSpent(e.target.value)}
                  placeholder="Hours spent"
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.5"
                />
                <button
                  onClick={handleAddWork}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
                >
                  Add Work Entry
                </button>
              </div>
            </div>

            {item.workDone && item.workDone.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Work History</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {item.workDone.map(work => (
                    <div key={work.id} className="p-3 bg-gray-50 rounded-md">
                      <div className="flex justify-between items-start">
                        <p className="text-sm">{work.description}</p>
                        <span className="text-xs text-gray-500">{work.hoursSpent}h</span>
                      </div>
                      <p className="text-xs text-gray-400">{work.date} by {work.author}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
