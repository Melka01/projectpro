import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logging';

/**
 * @typedef {Object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} code
 * @property {string} description
 * @property {string[]} phases
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} status
 * @property {string} health
 * @property {string} priority
 * @property {number} budgetPlanned
 * @property {number} budgetActual
 * @property {string} sponsor
 * @property {string} owner
 * @property {string[]} goals
 * @property {Array} kpis
 * @property {string[]} tags
 * @property {Array} links
 * @property {string[]} team
 * @property {string[]} documents
 * @property {ProjectDeliverable[]} deliverables
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ProjectDeliverable
 * @property {string} id - Deliverable ID
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} comments
 * @property {WorkLog[]} workDone
 */

/**
 * @typedef {Object} Deliverable
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} defaultPhase
 * @property {string[]} tags
 * @property {string[]} subDeliverables
 * @property {boolean} isAdHoc
 */

/**
 * @typedef {Object} WorkLog
 * @property {string} id
 * @property {string} date
 * @property {string} description
 * @property {number} hoursSpent
 * @property {string} author
 */

const DB_KEY = 'pm-timeline-db-v2';

const initialState = {
  projects: [],
  deliverables: [],
  teamMembers: [],
  documents: [],
  userSettings: {
    theme: 'light',
    branding: {},
    gist: { enabled: false, gistId: null, githubTokenMasked: null }
  }
};

function appReducer(state, action) {
  logger.debug('State update', { type: action.type, payload: action.payload });
  
  switch (action.type) {
    case 'LOAD_DATA':
      return { ...state, ...action.payload };
    
    case 'ADD_PROJECT':
      return {
        ...state,
        projects: [...state.projects, { ...action.payload, id: action.payload.id || uuidv4() }]
      };
    
    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map(p => 
          p.id === action.payload.id ? { ...p, ...action.payload, updatedAt: new Date().toISOString() } : p
        )
      };
    
    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter(p => p.id !== action.payload.id)
      };
    
    case 'ADD_DELIVERABLE':
      return {
        ...state,
        deliverables: [...state.deliverables, { ...action.payload, id: action.payload.id || uuidv4() }]
      };
    
    case 'UPDATE_DELIVERABLE':
      return {
        ...state,
        deliverables: state.deliverables.map(d => 
          d.id === action.payload.id ? { ...d, ...action.payload } : d
        )
      };
    
    case 'DELETE_DELIVERABLE':
      return {
        ...state,
        deliverables: state.deliverables.filter(d => d.id !== action.payload.id),
        projects: state.projects.map(p => ({
          ...p,
          deliverables: p.deliverables.filter(pd => pd.id !== action.payload.id)
        }))
      };
    
    default:
      logger.warn('Unknown action type', { type: action.type });
      return state;
  }
}

const AppContext = createContext();

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    const debounced = setTimeout(() => {
      saveToStorage(state);
    }, 300);
    return () => clearTimeout(debounced);
  }, [state]);

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(DB_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        dispatch({ type: 'LOAD_DATA', payload: data });
        logger.info('Data loaded from storage');
      } else {
        seedInitialData();
      }
    } catch (error) {
      logger.error('Failed to load from storage', error);
      seedInitialData();
    }
  };

  const saveToStorage = (data) => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
      logger.debug('Data saved to storage');
    } catch (error) {
      logger.error('Failed to save to storage', error);
    }
  };

  const seedInitialData = () => {
    const defaultDeliverables = [
      'Kick-off Document',
      'Security and compliancy start point',
      'Value Case',
      'Service Blueprint',
      'Roadmap',
      'Backlog',
      'Syllabus',
      'PSA (incl Domain Model) & Information Architecture',
      'Wireframe (Figma)',
      'PoC / Functional Design',
      'Governance Structure (incl. test automation setup)',
      'Statement of Work for Develop',
      'End presentation D&D'
    ].map((name, idx) => ({
      id: uuidv4(),
      name,
      description: name,
      defaultPhase: ['Discover', 'Design', 'Develop', 'Drive'][Math.floor(idx / 4)],
      tags: [],
      subDeliverables: [],
      isAdHoc: false
    }));

    const sampleProject = {
      id: uuidv4(),
      name: 'Sample Project',
      code: 'SP1',
      description: 'A demonstration project for the timeline',
      phases: ['Discover', 'Design', 'Develop', 'Drive'],
      startDate: '2025-08-01',
      endDate: '2025-12-31',
      status: 'Active',
      health: 'On Track',
      priority: 'High',
      budgetPlanned: 100000,
      budgetActual: 20000,
      sponsor: 'Jane Doe',
      owner: 'John Doe',
      goals: ['Deliver MVP', 'Ensure compliance'],
      kpis: [],
      tags: ['demo'],
      links: [],
      team: [],
      documents: [],
      deliverables: defaultDeliverables.slice(0, 5).map(d => ({
        id: d.id,
        startDate: '2025-08-15',
        endDate: '2025-09-15',
        comments: '',
        workDone: []
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const seedData = {
      ...initialState,
      deliverables: defaultDeliverables,
      projects: [sampleProject]
    };

    dispatch({ type: 'LOAD_DATA', payload: seedData });
    logger.info('Seeded initial data');
  };

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
