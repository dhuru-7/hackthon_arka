import { useState, useRef, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, ArrowUp, Send, Layout, Zap, Boxes, Plus, Network, Layers, LineChart, PieChart, ChevronLeft, Grid, Paintbrush, Paperclip, GitBranch, Image as ImageIcon, PenTool, SlidersHorizontal, ArrowDown, History, X, MessageSquareDot, Table2, CalendarRange, Trash2, Info, Loader2, ScratchPad, Category, BubbleChart, GridView, EventNote, Radar, ViewKanban, FilterFrames, ArkaLogo, Swimlane, ClassIcon, StateIcon, UserJourneyIcon, QuadrantIcon, RequirementIcon, GitGraphIcon, C4Icon, MindmapIcon, TimelineIcon, SankeyIcon, BlockIcon, VennIcon, WardleyIcon, TreeViewIcon, UseCaseIcon, FolderIcon, CustomSparkleIcon, SaveFilledIcon, Edit, Check } from './googleIcons';
import Arena from './Arena';
import Settings from './Settings';
import ProfileDropdown from './ProfileDropdown';
import { auth, onAuthStateChanged, signOut, isAuthInitialized } from './firebaseAuth';
import { db } from './firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { agentSuggestDiagramType, optimizePrompt, getSettings, importGithubRepo, buildContextPrompt, describeImageWithVision } from './aiService';
import { detectCodeType, getCodeSuggestions, tryDeterministicParse } from './codeToDiagramService';
import MySpace from './MySpace';
import ShareDiagramRoute from './ShareDiagramRoute';


const REPO_SUGGESTIONS = [
  {
    id: 'commit_digest',
    label: 'Weekly Commit Digest',
    icon: '📊',
    diagramType: 'xy',
    prompt: 'Generate a weekly commit activity and developer velocity digest for this repository.'
  },
  {
    id: 'pr_workflow',
    label: 'PR & Branching Workflow',
    icon: '🔀',
    diagramType: 'gitGraph',
    prompt: 'Map out the Pull Request code review and deployment workflow for this repository.'
  },
  {
    id: 'issue_triage',
    label: 'Issue Triage Pipeline',
    icon: '🐞',
    diagramType: 'kanban',
    prompt: 'Create an Issue Triage & Bug Resolution Kanban pipeline for this repository.'
  },
  {
    id: 'architecture',
    label: 'Codebase Architecture Map',
    icon: '🏗️',
    diagramType: 'architecture',
    prompt: 'Analyze this GitHub codebase and generate a high-level architecture diagram.'
  }
];

const DiagramsPage = () => {
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(() => !auth.currentUser);
  const [prompt, setPrompt] = useState(() => localStorage.getItem('arka_prompt') || '');
  const [selectedRepoSuggestion, setSelectedRepoSuggestion] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNavHovered, setIsNavHovered] = useState(false);
  const [showPinNotice, setShowPinNotice] = useState(false);
  const [viewState, setViewState] = useState(() => {
    const savedState = localStorage.getItem('arka_viewState') || 'input';
    const hasCode = localStorage.getItem('arka_last_mermaid_code');
    if (!['input', 'loading', 'result', 'arena'].includes(savedState)) return 'input';
    if (savedState === 'arena' && !hasCode) {
      return 'input';
    }
    return savedState;
  });
  const [suggestedType, setSuggestedType] = useState(() => localStorage.getItem('arka_diagramType') || null);
  const [agentSuggestion, setAgentSuggestion] = useState(null);
  const [suggestionError, setSuggestionError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [expandedCardType, setExpandedCardType] = useState(null);
  const [placeholderText, setPlaceholderText] = useState('Describe your flowchart...');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pinNoticeTimerRef = useRef(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState(null);
  const [editTitleText, setEditTitleText] = useState('');
  const [myspaceSyncVer, setMyspaceSyncVer] = useState(0);

  useEffect(() => {
    const handleSync = () => {
      setMyspaceSyncVer(v => v + 1);
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('arka_myspace_updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('arka_myspace_updated', handleSync);
    };
  }, []);

  const isItemSavedInMySpace = (item) => {
    if (!item) return false;
    if (item.is_myspace_saved) return true;
    try {
      const savedList = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
      const normPrompt = (item.prompt || item.rawPrompt || '').toLowerCase().trim();
      return savedList.some(d => {
        if (item.id && (d.id === item.id || d.id === `myspace_${item.id}` || item.id === `myspace_${d.id}`)) return true;
        const dPrompt = (d.prompt || '').toLowerCase().trim();
        if (normPrompt && dPrompt && normPrompt === dPrompt) return true;
        return false;
      });
    } catch {
      return false;
    }
  };
  const [currentDiagramId, setCurrentDiagramId] = useState(() => localStorage.getItem('arka_diagramId') || null);
  const suggestAbortControllerRef = useRef(null);
  const optimizeAbortControllerRef = useRef(null);
  const [showBrushMenu, setShowBrushMenu] = useState(false);
  const [showKeyError, setShowKeyError] = useState(false);
  const [contextAttachments, setContextAttachments] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('arka_context_attachments') || '[]');
      if (Array.isArray(parsed)) {
        return parsed
          .filter(item => item && !item.isUploading && (item.previewUrl || item.dataUrl || item.context || item.repo))
          .map((item, idx) => ({
            ...item,
            id: item.id || `att_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`
          }));
      }
      return [];
    } catch {
      return [];
    }
  });
  const [showGitModal, setShowGitModal] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [isImportingRepo, setIsImportingRepo] = useState(false);
  const [gitImportError, setGitImportError] = useState('');
  const [activeUploadsCount, setActiveUploadsCount] = useState(0);
  const isUploadingFile = activeUploadsCount > 0;
  const [highlightColor] = useState(() => {
    const colors = [
      '#D5F3D8', // Green
      '#A5F3FC', // Aqua
      '#FBCFE8', // Baby Pink
      '#FECACA'  // Light Red
    ];
    const lastIndexStr = localStorage.getItem('arka_highlight_index');
    let index = 0;
    if (lastIndexStr !== null) {
      index = parseInt(lastIndexStr, 10);
      if (isNaN(index)) index = 0;
    }
    if (!window.__arka_highlight_incremented) {
      window.__arka_highlight_incremented = true;
      const nextIndex = (index + 1) % colors.length;
      localStorage.setItem('arka_highlight_index', String(nextIndex));
      return colors[nextIndex];
    }
    return colors[index];
  });
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [animatingText, setAnimatingText] = useState(null);
  const [animationTokens, setAnimationTokens] = useState([]);
  const [staggerDelay, setStaggerDelay] = useState(0.015);



  const handleCancelSuggest = () => {
    if (suggestAbortControllerRef.current) {
      suggestAbortControllerRef.current.abort();
    }
    setViewState('input');
  };

  useEffect(() => {
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('arka_prompt', prompt);
    localStorage.setItem('arka_viewState', viewState);
    if (suggestedType) localStorage.setItem('arka_diagramType', suggestedType);
    if (currentDiagramId) localStorage.setItem('arka_diagramId', currentDiagramId);
  }, [prompt, viewState, suggestedType, currentDiagramId]);

  useEffect(() => {
    const cleanToSave = contextAttachments.filter(item => item && !item.isUploading);
    localStorage.setItem('arka_context_attachments', JSON.stringify(cleanToSave));
  }, [contextAttachments]);

  const diagramTypes = [
    { id: 'flowchart', label: 'Flowchart', icon: Network, color: '#000000' },
    { id: 'swimlane', label: 'Swimlanes Diagram', icon: Swimlane, color: '#000000' },
    { id: 'sequence', label: 'Sequence Diagram', icon: MessageSquareDot, color: '#000000' },
    { id: 'classDiagram', label: 'Class Diagram', icon: ClassIcon, color: '#000000' },
    { id: 'stateDiagram', label: 'State Diagram', icon: StateIcon, color: '#000000' },
    { id: 'erDiagram', label: 'Entity Relationship', icon: Table2, color: '#000000' },
    { id: 'userJourney', label: 'User Journey', icon: UserJourneyIcon, color: '#000000' },
    { id: 'gantt', label: 'Gantt Chart', icon: CalendarRange, color: '#000000' },
    { id: 'pie', label: 'Pie Chart', icon: PieChart, color: '#000000' },
    { id: 'quadrantChart', label: 'Quadrant Chart', icon: QuadrantIcon, color: '#000000' },
    { id: 'requirementDiagram', label: 'Requirement Diagram', icon: RequirementIcon, color: '#000000' },
    { id: 'gitGraph', label: 'GitGraph (Git)', icon: GitGraphIcon, color: '#000000' },
    { id: 'c4Diagram', label: 'C4 Diagram', icon: C4Icon, color: '#000000' },
    { id: 'mindmap', label: 'Mindmaps', icon: MindmapIcon, color: '#000000' },
    { id: 'timeline', label: 'Timeline', icon: TimelineIcon, color: '#000000' },
    { id: 'sankey', label: 'Sankey Diagram', icon: SankeyIcon, color: '#000000' },
    { id: 'xy', label: 'XY Chart', icon: LineChart, color: '#000000' },
    { id: 'block', label: 'Block Diagram', icon: BlockIcon, color: '#000000' },
    { id: 'packet', label: 'Packet Diagram', icon: FilterFrames, color: '#000000' },
    { id: 'kanban', label: 'Kanban Board', icon: ViewKanban, color: '#000000' },
    { id: 'architecture', label: 'Architecture', icon: Layers, color: '#000000' },
    { id: 'radar', label: 'Radar Chart', icon: Radar, color: '#000000' },
    { id: 'eventModeling', label: 'Event Modeling', icon: EventNote, color: '#000000' },
    { id: 'treemap', label: 'Treemap', icon: GridView, color: '#000000' },
    { id: 'venn', label: 'Venn Diagram', icon: VennIcon, color: '#000000' },
    { id: 'ishikawa', label: 'Ishikawa (Fishbone)', icon: BubbleChart, color: '#000000' },
    { id: 'wardley', label: 'Wardley Map', icon: WardleyIcon, color: '#000000' },
    { id: 'cynefin', label: 'Cynefin Framework', icon: Category, color: '#000000' },
    { id: 'treeView', label: 'TreeView', icon: TreeViewIcon, color: '#000000' },
    { id: 'useCase', label: 'Use Case Diagram', icon: UseCaseIcon, color: '#000000' }
  ];

  const isBetaDiagram = (id) => !['flowchart', 'architecture', 'sequence', 'erDiagram', 'gantt', 'xy', 'classDiagram', 'stateDiagram', 'userJourney', 'quadrantChart', 'gitGraph', 'pie', 'ishikawa', 'requirementDiagram', 'c4Diagram', 'mindmap', 'useCase'].includes(id);

  const openPinNotice = () => {
    setShowPinNotice(true);
    window.clearTimeout(pinNoticeTimerRef.current);
    pinNoticeTimerRef.current = window.setTimeout(() => setShowPinNotice(false), 2600);
  };

  const openGitImport = () => {
    setShowBrushMenu(false);
    setShowPinNotice(false);
    setGitImportError('');
    setShowGitModal(true);
  };

  const handleImportGitRepo = async () => {
    if (!gitRepoUrl.trim() || isImportingRepo) return;
    setIsImportingRepo(true);
    setGitImportError('');

    try {
      const result = await importGithubRepo(gitRepoUrl.trim());
      const gitItem = {
        type: 'github',
        repo: result.repo,
        url: result.url,
        branch: result.branch,
        fileCount: result.file_count,
        context: result.context,
      };
      setContextAttachments([gitItem]);
      localStorage.setItem('arka_context_attachments', JSON.stringify([gitItem]));
      localStorage.setItem('arka_last_github_repo', JSON.stringify(gitItem));
      setGitRepoUrl('');
      setShowGitModal(false);
    } catch (err) {
      setGitImportError(err.message || 'Failed to import repository.');
    } finally {
      setIsImportingRepo(false);
    }
  };

  const removeContextAttachment = async (targetId) => {
    if (!targetId) return;
    setSuggestionError('');
    let itemToRemove = null;
    setContextAttachments(prev => {
      itemToRemove = prev.find(item => item.id === targetId || `${item.type}-${item.repo || item.url || item.filename}` === targetId);
      const updated = prev.filter(item => {
        if (item.id) {
          return item.id !== targetId;
        }
        return `${item.type}-${item.repo || item.url || item.filename}` !== targetId;
      });
      try {
        localStorage.setItem('arka_context_attachments', JSON.stringify(updated.filter(u => u && !u.isUploading).map(u => ({
          ...u,
          previewUrl: u.dataUrl || u.previewUrl,
          isUploading: false
        }))));
      } catch (e) {}
      return updated;
    });

    if (itemToRemove?.isUploading) {
      setActiveUploadsCount(c => Math.max(0, c - 1));
    }

    if (itemToRemove) {
      const filename = itemToRemove.filename || itemToRemove.name || itemToRemove.repo;
      if (filename) {
        try {
          await fetch('/api/delete-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, type: itemToRemove.type, url: itemToRemove.url })
          });
        } catch (err) {
          console.error("Failed to delete document on backend:", err);
        }
      }
    }
  };

  const processAndAttachFile = async (file) => {
    if (!file) return;

    if (contextAttachments.length >= 4) {
      setSuggestionError('Maximum 4 files allowed. Remove a file to attach a new one.');
      return;
    }

    setSuggestionError('');
    const isImage = file.type ? file.type.startsWith('image/') : (file.name && /\.(png|jpe?g|webp|svg)$/i.test(file.name));

    // Guaranteed distinct ID and filename so multiple images are never conflated
    const uniqueId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isGenericName = !file.name || file.name === 'image.png' || file.name === 'blob';
    const uniqueFilename = isGenericName 
      ? `image_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 6)}.png` 
      : file.name;

    let previewUrl = null;
    if (isImage) {
      try {
        previewUrl = URL.createObjectURL(file);
      } catch (e) {}
    }

    // Immediately show placeholder card with blurred image and circular spinner animation (0ms latency!)
    const tempAttachment = {
      id: uniqueId,
      type: isImage ? 'image' : 'file',
      filename: uniqueFilename,
      name: uniqueFilename,
      previewUrl: previewUrl,
      isUploading: true,
    };

    setContextAttachments(prev => {
      if (prev.length >= 4) return prev;
      return [...prev, tempAttachment];
    });

    setActiveUploadsCount(c => c + 1);

    try {
      // Parallelize local file reading and backend upload for maximum speed
      const localReadPromise = isImage ? new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }) : new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      });

      const formData = new FormData();
      formData.append('file', file, uniqueFilename);
      const uploadPromise = fetch('/api/upload-doc', {
        method: 'POST',
        body: formData,
      }).then(res => res.json().catch(() => ({})));

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timed out. Please try again.')), 25000)
      );

      const [localReadResult, data] = await Promise.race([
        Promise.all([localReadPromise, uploadPromise]),
        timeoutPromise
      ]);

      if (data?.error) {
        throw new Error(data.error);
      }

      let finalContext = data?.extracted_text || (!isImage ? localReadResult : null);
      if (!finalContext && isImage && (localReadResult || data?.data_url)) {
        try {
          finalContext = await describeImageWithVision(localReadResult || data.data_url, uniqueFilename);
        } catch (vErr) {
          console.warn("Vision description error:", vErr);
        }
      }

      if (!finalContext) {
        finalContext = isImage 
          ? `[IMAGE ATTACHMENT: ${uniqueFilename}]\nImage attached. Model diagram based on visual content and user prompt.`
          : `UPLOADED FILE CONTEXT\nFilename: ${uniqueFilename}\n\n${!isImage && localReadResult ? localReadResult : ''}`;
      }

      setContextAttachments(prev => {
        const exists = prev.some(item => item.id === uniqueId);
        if (!exists) return prev; // User removed while uploading

        // STRICTLY match by uniqueId so that multiple images never overwrite each other!
        return prev.map(item => {
          if (item.id === uniqueId) {
            return {
              id: uniqueId,
              type: isImage ? 'image' : 'file',
              filename: uniqueFilename,
              previewUrl: (isImage ? localReadResult : null) || data?.data_url || previewUrl,
              dataUrl: (isImage ? localReadResult : null) || data?.data_url,
              name: uniqueFilename,
              context: finalContext,
              isUploading: false,
            };
          }
          return item;
        });
      });
    } catch (err) {
      console.error('File upload error:', err);
      setContextAttachments(prev => prev.filter(item => item.id !== uniqueId));
      setSuggestionError(err.message || 'Failed to attach file.');
    } finally {
      setActiveUploadsCount(c => Math.max(0, c - 1));
    }
  };

  const handleFileAttachment = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    if (contextAttachments.length >= 4) {
      setSuggestionError('Maximum 4 files allowed. Remove a file to attach a new one.');
      return;
    }

    setSuggestionError('');
    const remainingSlots = Math.max(0, 4 - contextAttachments.length);
    if (files.length > remainingSlots) {
      setSuggestionError('Maximum 4 files allowed. Some files were not attached.');
    }

    for (const file of files.slice(0, remainingSlots)) {
      processAndAttachFile(file);
    }
  };

  const lastPromptPasteTimeRef = useRef(0);

  const handlePaste = async (e) => {
    if (e.defaultPrevented) return;

    const now = Date.now();
    // Low debounce so rapid sequential pastes are fast and smooth without double-firing identical events
    if (now - lastPromptPasteTimeRef.current < 60) {
      return;
    }

    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;
    if (!items && !files) return;

    const imageFiles = [];
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type && files[i].type.startsWith('image/')) {
          imageFiles.push(files[i]);
        }
      }
    }
    if (imageFiles.length === 0 && items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      lastPromptPasteTimeRef.current = now;
      e.preventDefault();
      e.stopPropagation();

      if (contextAttachments.length >= 4) {
        setSuggestionError('Maximum 4 files allowed. Remove a file to attach a new one.');
        return;
      }

      setSuggestionError('');
      const remainingSlots = Math.max(0, 4 - contextAttachments.length);
      if (imageFiles.length > remainingSlots) {
        setSuggestionError('Maximum 4 files allowed. Some files were not attached.');
      }

      for (const file of imageFiles.slice(0, remainingSlots)) {
        processAndAttachFile(file);
      }
    }
  };

  useEffect(() => {
    if (viewState !== 'input') return;

    const handleGlobalPaste = (e) => {
      if (e.defaultPrevented) return;
      if (document.activeElement === textareaRef.current) return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (document.activeElement?.closest?.('.git-import-modal') || tag === 'input') {
        return;
      }
      handlePaste(e);
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [viewState, contextAttachments, isUploadingFile]);

  // Auto-resize textarea to expand up to 184px (base 130px + 2 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '130px';
      const newHeight = Math.max(130, Math.min(textareaRef.current.scrollHeight, 184));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [prompt]);

  // Animated Placeholder Typing Effect
  useEffect(() => {
    const phrases = [
      "Describe a Mermaid flowchart...",
      "Describe a sequence diagram...",
      "Paste a GitHub repo URL...",
      "Describe your system architecture..."
    ];
    let currentPhraseIndex = 0;
    let isDeleting = false;
    let charIndex = 0;
    let typingTimeout;

    const typePlaceholder = () => {
      const currentPhrase = phrases[currentPhraseIndex];

      if (isDeleting) {
        setPlaceholderText(currentPhrase.substring(0, charIndex));
        charIndex--;
      } else {
        setPlaceholderText(currentPhrase.substring(0, charIndex));
        charIndex++;
      }

      let typingSpeed = isDeleting ? 40 : 80;

      if (!isDeleting && charIndex > currentPhrase.length) {
        isDeleting = true;
        typingSpeed = 2000; // Pause at end of word
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
        typingSpeed = 500; // Pause before typing new word
      }

      typingTimeout = setTimeout(typePlaceholder, typingSpeed);
    };

    typingTimeout = setTimeout(typePlaceholder, 100);
    return () => clearTimeout(typingTimeout);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(pinNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Instantly populate from local cache (0ms delay) so history is immediately visible
    try {
      const localAll = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
      const localSaved = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
      const deletedIds = new Set(JSON.parse(localStorage.getItem('arka_deleted_diagram_ids') || '[]'));
      const map = new Map();

      (localAll || []).forEach(item => {
        if (item && item.id && !deletedIds.has(item.id)) {
          map.set(item.id, {
            id: item.id,
            prompt: item.prompt || 'Untitled Diagram',
            rawPrompt: item.prompt,
            diagramType: item.diagram_type || 'flowchart',
            code: item.code || '',
            gitUrl: item.git_url || null,
            updatedAt: {
              toDate: () => new Date(item.updated_at || Date.now())
            }
          });
        }
      });

      (localSaved || []).forEach(item => {
        if (item && item.id && !deletedIds.has(item.id) && !map.has(item.id)) {
          map.set(item.id, {
            id: item.id,
            prompt: item.prompt || 'Untitled Diagram',
            rawPrompt: item.prompt,
            diagramType: item.diagram_type || 'flowchart',
            code: item.code || '',
            gitUrl: item.git_url || null,
            updatedAt: {
              toDate: () => new Date(item.saved_at || item.updated_at || Date.now())
            }
          });
        }
      });

      const cachedCount = map.size;
      if (isMounted) {
        setHistoryItems(Array.from(map.values()));
        if (!isSidebarOpen || cachedCount > 0) {
          setHistoryLoading(false);
        }
      }
    } catch (e) {
      if (isMounted) setHistoryLoading(false);
    }

    // 2. Fetch from DB in background with generous timeout safety
    const fetchHistory = async () => {
      try {
        const currentUser = auth?.currentUser;
        if (!currentUser?.uid) return;

        // Only show loading indicator if we don't have any cached diagrams yet
        if (isSidebarOpen && cachedCount === 0) {
          setHistoryLoading(true);
        }

        const q = query(
          collection(db, 'diagrams'),
          where('uid', '==', currentUser.uid)
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB fetch timeout")), 8000)
        );

        const dbPromise = getDocs(q).then(snapshot => ({
          data: snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        }));

        const res = await Promise.race([dbPromise, timeoutPromise]);
        const data = res?.data;

        if (data && isMounted) {
          const localAll = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
          const localSaved = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
          const deletedIds = new Set(JSON.parse(localStorage.getItem('arka_deleted_diagram_ids') || '[]'));
          const map = new Map();

          data.forEach(item => {
            if (!item || !item.id || deletedIds.has(item.id)) return;
            let gitUrl = item.git_url || null;
            if (!gitUrl && item.prompt) {
              const match = item.prompt.match(/\[GIT_REPO:\s*(https?:\/\/github\.com\/[^\s\]]+)\]/i) || item.prompt.match(/https?:\/\/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
              if (match) gitUrl = match[1] ? (match[1].startsWith('http') ? match[1] : `https://${match[1]}`) : match[0];
            }
            map.set(item.id, {
              id: item.id,
              prompt: item.prompt ? item.prompt.replace(/\[GIT_REPO:\s*https?:\/\/github\.com\/[^\s\]]+\]/gi, '').trim() : 'Untitled Diagram',
              rawPrompt: item.prompt,
              diagramType: item.diagram_type || 'flowchart',
              code: item.code || '',
              gitUrl: gitUrl,
              is_myspace_saved: !!item.is_myspace_saved,
              updatedAt: {
                toDate: () => new Date(item.updated_at || item.saved_at || Date.now())
              },
              timestamp: new Date(item.updated_at || item.saved_at || 0).getTime()
            });
          });

          // Check if local items need syncing to Firestore
          localAll.forEach(item => {
            if (item && item.id && !deletedIds.has(item.id) && !map.has(item.id)) {
              map.set(item.id, {
                id: item.id,
                prompt: item.prompt || 'Untitled Diagram',
                rawPrompt: item.prompt,
                diagramType: item.diagram_type || 'flowchart',
                code: item.code || '',
                gitUrl: item.git_url || null,
                is_myspace_saved: !!item.is_myspace_saved,
                updatedAt: {
                  toDate: () => new Date(item.updated_at || Date.now())
                },
                timestamp: new Date(item.updated_at || 0).getTime()
              });
              setDoc(doc(db, 'diagrams', item.id), {
                id: item.id,
                uid: currentUser.uid,
                prompt: item.prompt || 'Untitled Diagram',
                code: item.code || '',
                diagram_type: item.diagram_type || 'flowchart',
                updated_at: item.updated_at || new Date().toISOString()
              }, { merge: true }).catch(() => {});
            }
          });

          localSaved.forEach(item => {
            if (item && item.id && !deletedIds.has(item.id) && !map.has(item.id)) {
              map.set(item.id, {
                id: item.id,
                prompt: item.prompt || 'Untitled Diagram',
                rawPrompt: item.prompt,
                diagramType: item.diagram_type || 'flowchart',
                code: item.code || '',
                gitUrl: item.git_url || null,
                is_myspace_saved: true,
                updatedAt: {
                  toDate: () => new Date(item.saved_at || item.updated_at || Date.now())
                },
                timestamp: new Date(item.saved_at || item.updated_at || 0).getTime()
              });
            }
          });

          const sortedHistory = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);

          setHistoryItems(sortedHistory);
          localStorage.setItem('arka_all_diagram_history', JSON.stringify(sortedHistory.map(h => ({
            id: h.id,
            prompt: h.prompt,
            diagram_type: h.diagramType,
            code: h.code,
            git_url: h.gitUrl,
            updated_at: h.updatedAt.toDate().toISOString(),
            is_myspace_saved: h.is_myspace_saved
          }))));
        }
      } catch (error) {
        console.warn("[History] DB background fetch error:", error?.message);
      } finally {
        if (isMounted) {
          setHistoryLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [isSidebarOpen, auth?.currentUser, myspaceSyncVer]);



  const handleOptimizePrompt = async () => {
    if (!prompt.trim() || isOptimizingPrompt || animatingText) return;

    const s = getSettings();
    if (s.providerType === 'cloud' && !s.apiKey) {
      setShowKeyError(true);
      return;
    }
    if (s.providerType === 'local' && !s.localModel) {
      setShowKeyError(true);
      return;
    }

    setIsOptimizingPrompt(true);
    setSuggestionError('');

    const abortController = new AbortController();
    optimizeAbortControllerRef.current = abortController;

    try {
      const optimized = await optimizePrompt(prompt, abortController.signal);
      if (!optimized) {
        throw new Error("Could not optimize prompt.");
      }

      // Prepare animation tokens
      const useWords = optimized.length > 200;
      const tokens = useWords ? optimized.split(/(\s+)/) : Array.from(optimized);
      const delay = Math.min(1.2 / tokens.length, useWords ? 0.035 : 0.015);

      setAnimationTokens(tokens);
      setStaggerDelay(delay);
      setAnimatingText(optimized);
      setIsOptimizingPrompt(false);

      // Duration: total stagger delay + fade-in duration (0.5s)
      const durationMs = (tokens.length * delay * 1000) + 500;
      setTimeout(() => {
        setPrompt(optimized);
        setAnimatingText(null);
        setAnimationTokens([]);
      }, durationMs);

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("Optimize prompt request aborted.");
        setIsOptimizingPrompt(false);
        return;
      }
      console.error("Optimize prompt error:", err);
      setSuggestionError(err.message || "Failed to optimize prompt. Please try again.");
      setIsOptimizingPrompt(false);
    }
  };

  const handleCancelOptimize = () => {
    if (optimizeAbortControllerRef.current) {
      optimizeAbortControllerRef.current.abort();
      optimizeAbortControllerRef.current = null;
    }
    setIsOptimizingPrompt(false);
  };

  const handleBrushClick = (e) => {
    e.stopPropagation();
    if (isOptimizingPrompt) {
      handleCancelOptimize();
    } else if (!animatingText) {
      setShowBrushMenu(!showBrushMenu);
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || viewState !== 'input') return;

    const s = getSettings();
    if (s.providerType === 'cloud' && !s.apiKey) {
      setShowKeyError(true);
      return;
    }
    if (s.providerType === 'local' && !s.localModel) {
      setShowKeyError(true);
      return;
    }

    if (auth?.currentUser && historyItems.length >= 50) {
      alert("You have reached the 50 diagram limit. Please delete some diagrams from History to save new ones.");
      return;
    }

    // If user clicked one of the 4 contextual suggestions (GitHub or Code File), skip suggestion window and go straight to Arena!
    if (selectedRepoSuggestion && selectedRepoSuggestion.diagramType) {
      const targetType = selectedRepoSuggestion.diagramType;
      const targetPrompt = prompt.trim() || selectedRepoSuggestion.prompt;
      
      // If code file and deterministic parse is available for primary diagram:
      if (activeCodeAttachment && activeCodeAttachment.context) {
        const directMermaid = tryDeterministicParse(targetType, activeCodeAttachment.context, activeCodeAttachment.filename || activeCodeAttachment.name);
        if (directMermaid) {
          localStorage.setItem('arka_last_mermaid_code', directMermaid);
        } else {
          localStorage.removeItem('arka_last_mermaid_code');
        }
      } else {
        localStorage.removeItem('arka_last_mermaid_code');
      }

      setCurrentDiagramId(Date.now().toString());
      localStorage.setItem('arka_diagramType', targetType);
      localStorage.setItem('arka_prompt', targetPrompt);
      localStorage.setItem('arka_viewState', 'arena');
      setSuggestedType(targetType);
      setViewState('arena');
      return;
    }

    setCurrentDiagramId(Date.now().toString());
    localStorage.removeItem('arka_last_mermaid_code');
    setSuggestedType(null);
    setAgentSuggestion(null);
    setExpandedCardType(null);
    setSuggestionError('');
    setViewState('loading');

    const abortController = new AbortController();
    suggestAbortControllerRef.current = abortController;

    try {
      const promptForSuggestion = buildContextPrompt(prompt, contextAttachments);
      const suggestResult = await agentSuggestDiagramType(promptForSuggestion, abortController.signal);
      const nextType = suggestResult?.suggestions?.[0]?.type || suggestResult?.suggested_type;
      if (!nextType) throw new Error('The selected AI model returned no diagram suggestions.');
      setSuggestedType(nextType);
      setAgentSuggestion(suggestResult || null);
      setViewState('result');
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error("AI Error:", error);
      setSuggestionError(error.message || 'The selected AI model could not analyze this prompt.');
      setViewState('input');
    }
  };

  const activeGitAttachment = useMemo(() => {
    return contextAttachments.find(att => att && (att.type === 'github' || att.repo || (att.url && att.url.includes('github.com'))));
  }, [contextAttachments]);

  const activeCodeAttachment = useMemo(() => {
    return contextAttachments.find(att => {
      if (!att || att.type === 'github' || att.isUploading) return false;
      const name = (att.filename || att.name || '').toLowerCase();
      return /\.(sql|prisma|ya?ml|json|ts|tsx|js|jsx|py|go|rs|java|cpp|c|cs|php|rb)$/i.test(name) || (att.context && /^(CREATE TABLE|model\s+\w+\s*\{|version:\s*['"]?[23]|services:)/im.test(att.context));
    });
  }, [contextAttachments]);

  const activeSuggestionContext = useMemo(() => {
    if (activeGitAttachment) {
      return { type: 'github', suggestions: REPO_SUGGESTIONS, item: activeGitAttachment };
    }
    if (activeCodeAttachment) {
      const codeType = detectCodeType(activeCodeAttachment.filename || activeCodeAttachment.name, activeCodeAttachment.context);
      const suggestions = getCodeSuggestions(codeType);
      return { type: 'code', codeType, suggestions, item: activeCodeAttachment };
    }
    return null;
  }, [activeGitAttachment, activeCodeAttachment]);

  const hasGitRepo = Boolean(activeGitAttachment);
  const hasContextSuggestions = Boolean(activeSuggestionContext && !selectedRepoSuggestion);

  const handleSelectRepoSuggestion = (item) => {
    setSelectedRepoSuggestion(item);
    setPrompt(item.prompt);
    if (item.diagramType) setSuggestedType(item.diagramType);
  };

  const handleRemoveRepoSuggestion = () => {
    setSelectedRepoSuggestion(null);
    setPrompt('');
  };

  const handleReset = () => {
    setPrompt('');
    setSelectedRepoSuggestion(null);
    setViewState('input');
    setSuggestedType(null);
    setAgentSuggestion(null);
    setSuggestionError('');
    setCurrentDiagramId(null);
    setShowAll(false);
    setExpandedCardType(null);
    setContextAttachments([]);
    setGitRepoUrl('');
    setGitImportError('');
    localStorage.removeItem('arka_prompt');
    localStorage.removeItem('arka_last_mermaid_code');
    localStorage.removeItem('arka_diagramId');
    localStorage.removeItem('arka_viewState');
    localStorage.removeItem('arka_diagramType');
    localStorage.removeItem('arka_context_attachments');
    localStorage.removeItem('arka_last_github_repo');
  };

  const handleProceed = () => {
    if (!suggestedType) return;
    localStorage.removeItem('arka_last_mermaid_code');
    setViewState('arena');
  };

  const loadHistoryItem = (item) => {
    localStorage.setItem('arka_last_mermaid_code', item.code);
    localStorage.setItem('arka_prompt', item.prompt || item.rawPrompt || '');
    localStorage.setItem('arka_diagramId', item.id);
    localStorage.setItem('arka_diagramType', item.diagramType || 'flowchart');
    localStorage.setItem('arka_viewState', 'arena');
    setPrompt(item.prompt || item.rawPrompt || '');
    setSuggestedType(item.diagramType);
    setCurrentDiagramId(item.id);
    
    if (item.gitUrl) {
      const repoName = item.gitUrl.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
      const gitItem = {
        type: 'github',
        url: item.gitUrl,
        repo: repoName,
        isReconnecting: true
      };
      setContextAttachments([gitItem]);
      localStorage.setItem('arka_context_attachments', JSON.stringify([gitItem]));
    } else {
      setContextAttachments([]);
      localStorage.removeItem('arka_context_attachments');
    }
    
    localStorage.removeItem('arka_last_github_repo');
    setViewState('arena');
    setIsSidebarOpen(false);
  };

  const handleDeleteHistoryItem = async (e, id) => {
    e.stopPropagation();

    if (editingHistoryId === id) {
      setEditingHistoryId(null);
      setEditTitleText('');
    }

    const targetItem = historyItems.find(item => item.id === id);

    // 0. Add ID to permanent deleted diagram IDs blacklist
    try {
      const deletedIds = JSON.parse(localStorage.getItem('arka_deleted_diagram_ids') || '[]');
      if (id && !deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('arka_deleted_diagram_ids', JSON.stringify(deletedIds));
      }
    } catch (err) {}

    // 1. Remove from local React history state
    setHistoryItems(prev => prev.filter(item => item.id !== id));

    // 2. Purge from localStorage 'arka_all_diagram_history'
    try {
      const allHistory = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
      const normCode = (targetItem?.code || '').replace(/```mermaid/gi, '').replace(/```/g, '').replace(/\r/g, '').trim();
      const normPrompt = (targetItem?.prompt || '').toLowerCase().trim();

      const updatedAllHistory = allHistory.filter(d => {
        if (!d) return false;
        if (id && (d.id === id || d.id === `myspace_${id}` || id === `myspace_${d.id}`)) return false;
        const dCode = (d.code || '').replace(/```mermaid/gi, '').replace(/```/g, '').replace(/\r/g, '').trim();
        const dPrompt = (d.prompt || '').toLowerCase().trim();
        if (normCode && dCode && normCode === dCode) return false;
        if (normPrompt && dPrompt && normPrompt === dPrompt) return false;
        return true;
      });
      localStorage.setItem('arka_all_diagram_history', JSON.stringify(updatedAllHistory));
    } catch (err) {
      console.error("Error updating local history cache on delete:", err);
    }

    // 3. Sync My Space saved list (remove if present)
    try {
      const savedList = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
      const normCode = (targetItem?.code || '').replace(/```mermaid/gi, '').replace(/```/g, '').replace(/\r/g, '').trim();
      const normPrompt = (targetItem?.prompt || '').toLowerCase().trim();

      const updatedSavedList = savedList.filter(d => {
        if (!d) return false;
        if (id && (d.id === id || d.id === `myspace_${id}` || id === `myspace_${d.id}`)) return false;
        const dCode = (d.code || '').replace(/```mermaid/gi, '').replace(/```/g, '').replace(/\r/g, '').trim();
        const dPrompt = (d.prompt || '').toLowerCase().trim();
        if (normCode && dCode && normCode === dCode) return false;
        if (normPrompt && dPrompt && normPrompt === dPrompt) return false;
        return true;
      });

      localStorage.setItem('arka_myspace_saved_diagrams', JSON.stringify(updatedSavedList));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('arka_myspace_updated'));
    } catch (err) {
      console.error("Error syncing MySpace on history delete:", err);
    }

    // 4. Remove from Database
    if (auth?.currentUser) {
      try {
        await deleteDoc(doc(db, 'diagrams', id));
      } catch (err) {
        console.error("Error deleting history item from DB:", err);
      }
    }
  };

  const handleStartRename = (e, item) => {
    e.stopPropagation();
    const cleanTitle = (item.prompt || item.title || 'Untitled Diagram')
      .replace(/\[GIT_REPO:.*?\]/gi, '')
      .trim() || 'Untitled Diagram';
    setEditingHistoryId(item.id);
    setEditTitleText(cleanTitle);
  };

  const handleCancelRename = (e) => {
    if (e) e.stopPropagation();
    setEditingHistoryId(null);
    setEditTitleText('');
  };

  const handleSaveRename = async (e, idToRename) => {
    if (e) e.stopPropagation();
    const trimmedTitle = editTitleText.trim() || 'Untitled Diagram';

    // 1. Update React local state
    setHistoryItems(prev => prev.map(item => {
      if (item.id === idToRename) {
        return {
          ...item,
          prompt: trimmedTitle,
          rawPrompt: trimmedTitle,
          title: trimmedTitle
        };
      }
      return item;
    }));

    // 2. If this diagram is currently open in Arena, update its prompt state & cache
    if (currentDiagramId === idToRename) {
      setPrompt(trimmedTitle);
      localStorage.setItem('arka_prompt', trimmedTitle);
    }

    // 3. Update localStorage 'arka_all_diagram_history'
    try {
      const allHistory = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
      const updatedAllHistory = allHistory.map(d => {
        if (d && (d.id === idToRename || d.id === `myspace_${idToRename}` || idToRename === `myspace_${d.id}`)) {
          return { ...d, prompt: trimmedTitle, title: trimmedTitle };
        }
        return d;
      });
      localStorage.setItem('arka_all_diagram_history', JSON.stringify(updatedAllHistory));
    } catch (err) {
      console.error("Error updating local history cache on rename:", err);
    }

    // 4. Sync My Space saved list if present
    try {
      const savedList = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
      const updatedSavedList = savedList.map(d => {
        if (d && (d.id === idToRename || d.id === `myspace_${idToRename}` || idToRename === `myspace_${d.id}`)) {
          return { ...d, prompt: trimmedTitle, title: trimmedTitle };
        }
        return d;
      });
      localStorage.setItem('arka_myspace_saved_diagrams', JSON.stringify(updatedSavedList));
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('arka_myspace_updated'));
    } catch (err) {
      console.error("Error syncing MySpace on history rename:", err);
    }

    // 5. Update Database if user is authenticated
    if (auth?.currentUser) {
      try {
        await setDoc(doc(db, 'diagrams', idToRename), {
          prompt: trimmedTitle,
          title: trimmedTitle,
          updated_at: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Error updating diagram title in DB:", err);
      }
    }

    setEditingHistoryId(null);
    setEditTitleText('');
  };

  const getDiagramIcon = (type) => {
    const dType = diagramTypes.find(d => d.id === type);
    return dType ? <dType.icon size={24} /> : <Network size={24} />;
  };

  const fastTransition = { type: "spring", stiffness: 450, damping: 30 };
  const hasText = prompt.length > 0;

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="diagrams-container">

      {/* Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => {
          setIsSidebarOpen(false);
          setEditingHistoryId(null);
        }}
      ></div>

      {/* History Sidebar */}
      <aside className={`history-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="history-header">
          <h3 className="history-title">
            History
          </h3>
          <button
            onClick={() => {
              setIsSidebarOpen(false);
              setEditingHistoryId(null);
            }}
            className="close-sidebar-btn"
            title="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="history-content">
          {historyLoading && historyItems.length === 0 ? (
            <div className="history-skeleton-list">
              {[1, 2, 3, 4].map(idx => (
                <div key={idx} className="history-skeleton-card">
                  <div className="history-skeleton-line is-time shimmer" />
                  <div className="history-skeleton-line is-title-1 shimmer" />
                  <div className="history-skeleton-line is-title-2 shimmer" />
                  <div className="history-skeleton-preview shimmer" />
                </div>
              ))}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="history-empty">
              <div className="history-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '38px', color: '#a1a1aa' }}>history</span>
              </div>
              <span>No diagrams generated yet.</span>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {historyItems.map(item => {
                const isSaved = isItemSavedInMySpace(item);
                const isEditing = editingHistoryId === item.id;
                const displayTitle = (item.prompt || item.title || 'Untitled Diagram')
                  .replace(/\[GIT_REPO:.*?\]/gi, '')
                  .trim() || 'Untitled Diagram';

                return (
                  <motion.div
                    layout
                    key={item.id}
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.94,
                      height: 0,
                      paddingTop: 0,
                      paddingBottom: 0,
                      marginTop: 0,
                      marginBottom: 0,
                      borderWidth: 0,
                      overflow: 'hidden'
                    }}
                    transition={{
                      layout: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                      opacity: { duration: 0.18 },
                      height: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
                      scale: { duration: 0.2 }
                    }}
                    className={`history-item ${isEditing ? 'is-editing' : ''}`}
                    onClick={() => !isEditing && loadHistoryItem(item)}
                  >
                    <p className="history-item-time">
                      {item.updatedAt?.toDate
                        ? item.updatedAt.toDate().toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : new Date().toLocaleDateString()}
                    </p>

                    {/* Bookmark in its original top-right position: fades out smoothly on hover */}
                    {isSaved && (
                      <span className="history-item-bookmark" title="Saved in My Space">
                        <SaveFilledIcon size={16} style={{ color: '#0f172a' }} />
                      </span>
                    )}

                    {/* Action buttons (Rename & Delete) in top right: fade in smoothly on hover */}
                    <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="history-item-action-btn"
                        onClick={(e) => handleStartRename(e, item)}
                        title="Rename diagram"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="history-item-action-btn is-delete"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        title="Delete diagram"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div
                      className="history-item-title-wrapper"
                      onClick={(e) => isEditing && e.stopPropagation()}
                    >
                      {isEditing ? (
                        <div className="history-item-rename-box" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            className="history-item-rename-input"
                            value={editTitleText}
                            onChange={(e) => setEditTitleText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(e, item.id);
                              if (e.key === 'Escape') handleCancelRename(e);
                            }}
                            autoFocus
                            placeholder="Diagram title..."
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            className="history-item-rename-btn is-save"
                            onClick={(e) => handleSaveRename(e, item.id)}
                            title="Save title (Enter)"
                            type="button"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            className="history-item-rename-btn is-cancel"
                            onClick={handleCancelRename}
                            title="Cancel (Esc)"
                            type="button"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <h4
                          className="history-item-title"
                          onDoubleClick={(e) => handleStartRename(e, item)}
                          title="Double-click to rename"
                        >
                          {displayTitle}
                        </h4>
                      )}
                    </div>

                    <div className="history-item-preview">
                      {getDiagramIcon(item.diagramType)}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </aside>

      <AnimatePresence mode="wait">
        {viewState === 'arena' ? (
          <motion.div
            key="arena-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="arena-full-page"
          >
            <Arena
              prompt={prompt}
              diagramType={suggestedType}
              diagramId={currentDiagramId}
              contextAttachments={contextAttachments}
              onUpdateContextAttachments={setContextAttachments}
              onBack={handleReset}
              onShowHistory={() => setIsSidebarOpen(true)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="planner-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="planner-wrapper"
          >
            {/* Top Navigation */}
            <header className="fixed-navbar">
              <div className="nav-left-group">

                {viewState === 'input' ? (
                  <div style={{ display: 'flex', alignItems: 'center', marginRight: '-0.17rem' }}>
                    <div
                      className="nav-expandable-group"
                      onMouseEnter={() => setIsNavHovered(true)}
                      onMouseLeave={() => setIsNavHovered(false)}
                    >
                      <button className="nav-btn-main" onClick={handleReset} title="New Diagram">
                        <Plus size={20} />
                      </button>
                      <button
                        className={`nav-btn-secondary ${isNavHovered ? 'visible' : ''}`}
                        onClick={() => setIsSidebarOpen(true)}
                        title="History"
                      >
                        HISTORY
                      </button>
                      <button
                        className={`nav-btn-icon ${isNavHovered ? 'visible' : ''}`}
                        onClick={() => navigate('/myspace')}
                        title="MySpace"
                        type="button"
                      >
                        <CustomSparkleIcon size={19} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                      className="nav-btn-main"
                      onClick={viewState === 'result' || viewState === 'loading' || viewState === 'arena' ? handleReset : undefined}
                      title="New Diagram"
                      style={{ borderRadius: '50%', height: '38px', width: '38px', minWidth: '38px', minHeight: '38px', aspectRatio: '1 / 1', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                    >
                      <ChevronLeft size={20} />
                    </button>
                  </div>
                )}

                {/* Logo or Suggestion Title */}
                {viewState === 'result' || viewState === 'loading' ? (
                  <span className="suggestion-title-updated" style={{ marginLeft: '1rem' }}>Ai suggested diagram/s</span>
                ) : (
                  <motion.div layout className="logo-wrapper" transition={fastTransition} style={{ transform: isHovered ? 'translateX(5px)' : 'translateX(0)' }}>
                    <span className="logo-arka">ARKA</span>
                    <span className="logo-diagrams">DIAGRAMS</span>
                  </motion.div>
                )}
              </div>

              <div className="nav-actions">
                {viewState === 'result' || viewState === 'loading' ? (
                  <button
                    className="show-all-header-btn"
                    onClick={() => {
                      setShowAll(!showAll);
                    }}
                    style={{
                      padding: '0.6rem 1.2rem',
                      borderRadius: '12px',
                      opacity: viewState === 'loading' ? 0.5 : 1,
                      pointerEvents: viewState === 'loading' ? 'none' : 'auto'
                    }}
                  >
                    <Grid size={18} /> {showAll ? "Hide All" : "Show all diagrams"}
                  </button>
                ) : (
                  <ProfileDropdown />
                )}
              </div>
            </header>

            <main className="diagrams-hero">
              <AnimatePresence mode="wait">
                {viewState === 'input' || viewState === 'loading' ? (
                  <motion.div
                    key="prompt-view"
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="hero-content"
                  >

                    {/* Hero Wrapper ensuring Prompt Box Centers exactly on the screen */}
                    <div className="hero-top-spacer">
                      <div className="hero-heading-area">
                        <AnimatePresence>
                          {hasContextSuggestions && viewState === 'input' && activeSuggestionContext?.suggestions && (
                            <motion.div
                              className="repo-suggestion-ovals-wrapper rainbow-arch"
                              initial={{ opacity: 0, y: 14, scale: 0.94 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.94 }}
                              transition={{ type: 'spring', duration: 0.32, bounce: 0.08 }}
                            >
                              <div className="repo-suggestion-ovals-container rainbow-container">
                                {activeSuggestionContext.suggestions.map((item, idx) => {
                                  const archTransforms = [
                                    { y: 22, rotate: -16 },
                                    { y: 0, rotate: -5 },
                                    { y: 0, rotate: 5 },
                                    { y: 22, rotate: 16 }
                                  ];
                                  const arch = archTransforms[idx] || { y: 0, rotate: 0 };

                                  return (
                                    <motion.button
                                      key={item.id}
                                      type="button"
                                      className={`repo-suggestion-oval-btn arch-pos-${idx}`}
                                      onClick={() => handleSelectRepoSuggestion(item)}
                                      initial={{ opacity: 0, scale: 0.94, y: arch.y + 10, rotate: arch.rotate }}
                                      animate={{ opacity: 1, scale: 1, y: arch.y, rotate: arch.rotate }}
                                      exit={{ opacity: 0, scale: 0.94, y: arch.y + 6, transition: { duration: 0.15 } }}
                                      transition={{
                                        delay: idx * 0.04,
                                        type: 'spring',
                                        duration: 0.32,
                                        bounce: 0.08
                                      }}
                                    >
                                      <span className="oval-btn-icon">{item.icon}</span>
                                      <span>{item.label}</span>
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <motion.h1
                          initial={{ opacity: 0, y: 12 }}
                          animate={{
                            opacity: viewState === 'input' ? 1 : 0,
                            y: (viewState === 'input' && hasContextSuggestions) ? 4 : (viewState === 'input' ? 0 : -10)
                          }}
                          transition={{ type: 'spring', duration: 0.3, bounce: 0.06 }}
                          className="hero-prompt-title"
                          style={{
                            pointerEvents: viewState === 'input' ? 'auto' : 'none',
                            visibility: viewState === 'input' || viewState === 'loading' ? 'visible' : 'hidden'
                          }}
                        >
                          What are we building <span style={{ position: 'relative', display: 'inline-block', padding: '0 8px', isolation: 'isolate' }}>
                            <span style={{ position: 'absolute', bottom: '6px', left: 0, width: '100%', height: '9px', backgroundColor: highlightColor, transform: 'rotate(-2deg) skewX(12deg)', opacity: 0.8, zIndex: -1 }}></span>
                            <span style={{ position: 'relative', zIndex: 10 }}>today?</span>
                          </span>
                        </motion.h1>
                      </div>

                      <div className="prompt-container">
                        <AnimatePresence mode="popLayout">
                          {viewState === 'loading' ? (
                            <motion.div
                              key="loader-only"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="new-loader-container"
                              style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                width: '100vw',
                                height: '100vh',
                                zIndex: 5000,
                                backgroundColor: '#f5f5f5',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2rem'
                              }}
                            >
                              <div className="loader"></div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                                <span style={{ 
                                  fontWeight: 400, 
                                  color: 'var(--text-main)', 
                                  fontSize: '1.1rem', 
                                  fontFamily: 'var(--font-mono)',
                                  textAlign: 'center',
                                  maxWidth: '90%',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}>
                                  Analyzing diagram types...
                                </span>
                                <button
                                  onClick={handleCancelSuggest}
                                  style={{
                                    padding: '0.6rem 1.5rem',
                                    borderRadius: '0.75rem',
                                    border: '1px solid #e5e7eb',
                                    background: '#ffffff',
                                    color: '#ef4444',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontFamily: 'var(--font-body)',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseOver={e => {
                                    e.currentTarget.style.background = '#fef2f2';
                                    e.currentTarget.style.borderColor = '#fca5a5';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                  }}
                                  onMouseOut={e => {
                                    e.currentTarget.style.background = '#ffffff';
                                    e.currentTarget.style.borderColor = '#e5e7eb';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="prompt-card"
                              initial={{ opacity: 0, y: 10, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ type: "spring", duration: 0.32, bounce: 0.08 }}
                              className="prompt-box-wrapper"
                            >
                              <div className={`prompt-box-main ${(isOptimizingPrompt || animatingText) ? 'optimizing' : ''}`}>
                                <div className="prompt-textarea-mask-container">
                                  <div className="prompt-textarea-fade-top"></div>
                                  <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    placeholder={placeholderText}
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    onPaste={handlePaste}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (hasText && !isOptimizingPrompt && !animatingText) handleSubmit();
                                      }
                                    }}
                                    className={`prompt-input-textarea ${isOptimizingPrompt ? 'textarea-optimizing' : ''}`}
                                    style={{
                                      color: (isOptimizingPrompt || animatingText) ? 'transparent' : 'inherit',
                                      caretColor: (isOptimizingPrompt || animatingText) ? 'transparent' : 'auto',
                                    }}
                                    disabled={isOptimizingPrompt || !!animatingText}
                                  />
                                  {(isOptimizingPrompt || animatingText) && (
                                    <div className="prompt-animation-overlay">
                                      {isOptimizingPrompt && !animatingText && (
                                        <span className="prompt-blur-placeholder">
                                          {prompt}
                                        </span>
                                      )}
                                      {animatingText && (
                                        <>
                                          {animationTokens.map((token, idx) => (
                                            <span 
                                              key={idx} 
                                              className="polish-token" 
                                              style={{ 
                                                animationDelay: `${idx * staggerDelay}s` 
                                              }}
                                            >
                                              {token}
                                            </span>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  )}
                                  <div className="prompt-textarea-fade-bottom"></div>
                                </div>

                                <div className="prompt-bottom-toolbar">
                                   <div className="toolbar-left" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', position: 'relative' }}>
                                     <AnimatePresence mode="wait">
                                       {(!hasText || showPinNotice) ? (
                                         <motion.button
                                           key="attach-plus"
                                           initial={{ opacity: 0, scale: 0.95 }}
                                           animate={{ opacity: 1, scale: 1 }}
                                           exit={{ opacity: 0, scale: 0.95 }}
                                           whileTap={{ scale: 0.9 }}
                                           transition={{ duration: 0.12 }}
                                           className="tool-icon-btn"
                                           title="Attach context"
                                           type="button"
                                           onClick={(e) => {
                                             e.stopPropagation();
                                             setShowBrushMenu(!showBrushMenu);
                                             setShowPinNotice(false);
                                           }}
                                         >
                                           <motion.span
                                             animate={{ rotate: showBrushMenu ? 45 : 0 }}
                                             transition={{ type: 'spring', stiffness: 600, damping: 28, mass: 0.5 }}
                                             style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                           >
                                             <Plus size={18} />
                                           </motion.span>
                                         </motion.button>
                                       ) : (
                                         <motion.button
                                           key="brush"
                                           initial={{ opacity: 0, scale: 0.95 }}
                                           animate={{ opacity: 1, scale: 1 }}
                                           exit={{ opacity: 0, scale: 0.95 }}
                                           transition={{ duration: 0.15 }}
                                           className="tool-icon-btn"
                                           title={isOptimizingPrompt ? "Cancel Polish" : "AI Polish & Files"}
                                           type="button"
                                           onClick={handleBrushClick}
                                           disabled={!!animatingText}
                                           style={{
                                             color: (isOptimizingPrompt || animatingText) ? '#0ea5e9' : 'inherit',
                                            }}
                                         >
                                           {isOptimizingPrompt ? (
                                             <Loader2 className="spin" size={17} />
                                           ) : (
                                             <svg 
                                               xmlns="http://www.w3.org/2000/svg" 
                                               height="17" 
                                               viewBox="0 -960 960 960" 
                                               width="17" 
                                               fill="currentColor"
                                             >
                                               <path d="M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 23-5.5 42T220-202q5 2 10 2h10Zm230-160L360-470l358-358q11-11 27.5-11.5T774-828l54 54q12 12 12 28t-12 28L470-360Zm-190 80Z"/>
                                             </svg>
                                           )}
                                         </motion.button>
                                       )}
                                     </AnimatePresence>

                                     {(contextAttachments.length > 0 || selectedRepoSuggestion) && (
                                         <div className="prompt-attachment-row">
                                           {contextAttachments.map(item => {
                                             const isImg = item.previewUrl || item.type === 'image';
                                             if (isImg) {
                                               return (
                                                 <div 
                                                   className="prompt-image-preview-card"
                                                   key={item.id}
                                                 >
                                                   <div className="prompt-image-preview-inner">
                                                     {item.previewUrl ? (
                                                       <img 
                                                         src={item.previewUrl} 
                                                         alt={item.filename || "Uploaded thumbnail"} 
                                                         className={`prompt-preview-img ${item.isUploading ? 'img-blurred' : ''}`} 
                                                       />
                                                     ) : (
                                                       <div className="prompt-preview-placeholder">
                                                         <ImageIcon size={20} color="#16a34a" />
                                                       </div>
                                                     )}

                                                     {item.isUploading && (
                                                       <div className="prompt-image-spinner-overlay" title="Uploading & analyzing image...">
                                                         <div className="prompt-image-circular-spinner" />
                                                       </div>
                                                     )}
                                                   </div>

                                                   <button
                                                     type="button"
                                                     className="prompt-image-remove-btn"
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       removeContextAttachment(item.id);
                                                     }}
                                                     title="Remove image"
                                                   >
                                                     <X size={10} strokeWidth={2.8} />
                                                   </button>
                                                 </div>
                                               );
                                             }

                                             return (
                                               <div 
                                                 className={`prompt-context-chip ${item.isUploading ? 'is-uploading' : ''}`} 
                                                 key={item.id || `${item.type}-${item.repo || item.url || item.filename}`}
                                               >
                                                 {item.type === 'github' && <GitBranch size={15} />}
                                                 {item.isUploading && <Loader2 size={13} className="spin" />}
                                                 <span>{item.repo || item.filename || 'Attached context'}</span>
                                                 <button
                                                   type="button"
                                                   onClick={() => removeContextAttachment(item.id || `${item.type}-${item.repo || item.url || item.filename}`)}
                                                   title="Remove context"
                                                 >
                                                   <X size={14} />
                                                 </button>
                                               </div>
                                             );
                                           })}

                                          {selectedRepoSuggestion && (
                                            <motion.div 
                                              className="prompt-context-chip suggestion-badge-aqua"
                                              initial={{ opacity: 0, scale: 0.82, x: 10 }}
                                              animate={{ opacity: 1, scale: 1, x: 0 }}
                                              exit={{ opacity: 0, scale: 0.82, x: 10 }}
                                              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                            >
                                              <span>{selectedRepoSuggestion.icon} {selectedRepoSuggestion.label}</span>
                                              <button
                                                type="button"
                                                onClick={handleRemoveRepoSuggestion}
                                                title={`Remove ${selectedRepoSuggestion.label}`}
                                              >
                                                <X size={14} />
                                              </button>
                                            </motion.div>
                                          )}
                                        </div>
                                     )}

                                     <AnimatePresence>
                                       {showPinNotice && (
                                         <motion.div
                                           className="pin-notice-popover"
                                           initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                           animate={{ opacity: 1, y: 0, scale: 1 }}
                                           exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                           transition={{ duration: 0.16 }}
                                         >
                                           This feature is under development.
                                         </motion.div>
                                       )}
                                     </AnimatePresence>

                                     {showBrushMenu && (
                                       <>
                                         <div 
                                           style={{
                                             position: 'fixed',
                                             top: 0,
                                             left: 0,
                                             right: 0,
                                             bottom: 0,
                                             zIndex: 40,
                                             background: 'transparent',
                                             cursor: 'default'
                                           }} 
                                           onClick={() => setShowBrushMenu(false)}
                                         />
                                         <motion.div
                                           className="brush-menu-popover"
                                           initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                           animate={{ opacity: 1, y: 0, scale: 1 }}
                                           exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                           transition={{ duration: 0.16 }}
                                         >
                                           <button 
                                             className="brush-menu-item" 
                                             onClick={() => {
                                               setShowBrushMenu(false);
                                               handleOptimizePrompt();
                                             }}
                                           >
                                             <svg 
                                               xmlns="http://www.w3.org/2000/svg" 
                                               height="16" 
                                               viewBox="0 -960 960 960" 
                                               width="16" 
                                               fill="currentColor"
                                             >
                                               <path d="M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 23-5.5 42T220-202q5 2 10 2h10Zm230-160L360-470l358-358q11-11 27.5-11.5T774-828l54 54q12 12 12 28t-12 28L470-360Zm-190 80Z"/>
                                             </svg>
                                             <span>Polish</span>
                                           </button>
                                           <button 
                                             className="brush-menu-item" 
                                             onClick={() => {
                                               setShowBrushMenu(false);
                                               fileInputRef.current?.click();
                                             }}
                                             disabled={isUploadingFile}
                                           >
                                             {isUploadingFile ? <Loader2 className="spin" size={16} /> : <Paperclip size={16} />}
                                             <span>{isUploadingFile ? 'Uploading' : 'Add files'}</span>
                                           </button>
                                           <button 
                                             className="brush-menu-item" 
                                             onClick={openGitImport}
                                           >
                                             <GitBranch size={16} />
                                             <span>Git repo</span>
                                           </button>
                                         </motion.div>
                                       </>
                                     )}
                                   </div>
                                  <motion.button
                                    onClick={handleSubmit}
                                    whileTap={hasText ? { scale: 0.9 } : {}}
                                    disabled={!hasText || isOptimizingPrompt || !!animatingText}
                                    className={`submit-btn ${hasText && !isOptimizingPrompt && !animatingText ? 'active' : 'inactive'}`}
                                  >
                                    <Send size={18} />
                                  </motion.button>
                                </div>
                                
                               {/* API Key Error Card Overlay */}
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  multiple
                                  accept=".pdf,.txt,.md,.docx,.doc,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.scss,.csv,.yaml,.yml,.xml,.sql,.prisma,.sh,.bat,.env,.c,.cpp,.java,.go,.rs,.php,.rb,.png,.jpg,.jpeg,.webp"
                                  style={{ display: 'none' }}
                                  onChange={handleFileAttachment}
                                />
                                <AnimatePresence>
                                  {showKeyError && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.96 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.96 }}
                                      style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'rgba(255, 255, 255, 0.97)',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        borderRadius: '22px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        padding: '1.25rem',
                                        zIndex: 100,
                                        border: '1px solid #fee2e2',
                                        boxShadow: '0 10px 25px rgba(220, 38, 38, 0.08)'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', color: '#ef4444' }}>
                                        <span style={{ fontSize: '1.15rem' }}>⚠️</span>
                                        <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, color: '#111827', fontFamily: 'var(--font-sans)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                          Provider Required
                                        </h3>
                                      </div>
                                      
                                      <p style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'center', marginBottom: '1rem', maxWidth: '380px', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                                        Add a Gemini, Groq, Sarvam, or local model connection to generate Mermaid diagrams.
                                      </p>

                                      <div style={{ display: 'flex', gap: '0.5rem', width: '100%', maxWidth: '300px', alignItems: 'center' }}>
                                        <button
                                          onClick={() => {
                                            setShowKeyError(false);
                                            navigate('/settings');
                                          }}
                                          style={{
                                            flex: 1,
                                            background: '#000000',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '0.5rem 0.8rem',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'opacity 0.2s',
                                            fontFamily: 'var(--font-sans)',
                                            textAlign: 'center'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.opacity = 0.9}
                                          onMouseLeave={e => e.currentTarget.style.opacity = 1}
                                        >
                                          Open Settings
                                        </button>
                                        <button
                                          onClick={() => {
                                            setShowKeyError(false);
                                            navigate('/settings');
                                          }}
                                          style={{
                                            flex: 1,
                                            background: '#f3f4f6',
                                            color: '#374151',
                                            border: '1px solid #e5e7eb',
                                            padding: '0.5rem 0.8rem',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            fontFamily: 'var(--font-sans)',
                                            textAlign: 'center'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
                                        >
                                          Need Help?
                                        </button>
                                        <button
                                          onClick={() => setShowKeyError(false)}
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#9ca3af',
                                            fontSize: '0.9rem',
                                            cursor: 'pointer',
                                            padding: '0.2rem 0.4rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginLeft: '0.25rem'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.color = '#4b5563'}
                                          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              {suggestionError && <div className="agent-suggestion-error">{suggestionError}</div>}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <p className="footer-hint">
                          ARKA AI can make mistakes. Verify important details.
                        </p>
                      </div>
                      <AnimatePresence>
                        {showGitModal && (
                          <motion.div
                            className="git-import-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <motion.div
                              className="git-import-modal"
                              initial={{ opacity: 0, y: 14, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 14, scale: 0.96 }}
                              transition={{ duration: 0.16 }}
                            >
                              <div className="git-import-header">
                                <div>
                                   <h3>Import GitHub Repository</h3>
                                   <p>Paste a public GitHub repository URL. ARKA will read key source files and use them as context for your Mermaid diagram.</p>
                                </div>
                                <button
                                  type="button"
                                  className="git-import-close"
                                  onClick={() => setShowGitModal(false)}
                                  disabled={isImportingRepo}
                                >
                                  <X size={18} />
                                </button>
                              </div>
                              <div className="git-import-row">
                                <input
                                  value={gitRepoUrl}
                                  onChange={(e) => setGitRepoUrl(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleImportGitRepo();
                                    }
                                  }}
                                  placeholder="https://github.com/owner/repo"
                                  disabled={isImportingRepo}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={handleImportGitRepo}
                                  disabled={!gitRepoUrl.trim() || isImportingRepo}
                                >
                                  <span>{isImportingRepo ? 'Importing' : 'Import'}</span>
                                </button>
                              </div>
                              {gitImportError && (
                                <div className="git-import-error">{gitImportError}</div>
                              )}
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>


                  </motion.div>
                ) : (
                  <motion.div
                    key="suggestion-view"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={fastTransition}
                    className="suggestion-board"
                  >


                    <div className="suggestion-scroll-area">
                      {!showAll ? (
                        <div className="suggestion-highlight-container" style={{ width: '100%' }}>
                          <div className="suggested-diagrams-grid">
                            <AnimatePresence mode="popLayout">
                              {(() => {
                                const suggestionsList = [...(agentSuggestion?.suggestions || [])];
                                const isSuggestedTypeInSuggestions = suggestionsList.some(s => s.type === suggestedType);
                                if (suggestedType && !isSuggestedTypeInSuggestions) {
                                  suggestionsList.push({
                                    type: suggestedType,
                                    confidence: 0,
                                    reason: "Manually selected from the diagram list.",
                                    isManual: true
                                  });
                                }
                                return suggestionsList;
                              })()
                                .filter(suggestion => !expandedCardType || expandedCardType === suggestion.type)
                                .map((suggestion) => {
                                  const type = diagramTypes.find(item => item.id === suggestion.type);
                                  if (!type) return null;
                                  const Icon = type.icon;
                                  const isSelected = suggestedType === suggestion.type;
                                  const isExpanded = expandedCardType === suggestion.type;

                                  return (
                                    <motion.div
                                      key={suggestion.type}
                                      layout
                                      initial={{ opacity: 0, scale: 0.96, y: 8 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.96, y: 8 }}
                                      transition={{ type: "spring", duration: 0.3, bounce: 0.08 }}
                                      className={`type-card grid-card suggested-card-updated ${isSelected ? 'highlight-border' : ''} ${isExpanded ? 'expanded' : ''}`}
                                      onClick={() => {
                                        if (!isExpanded) {
                                          setSuggestedType(suggestion.type);
                                        }
                                      }}
                                    >
                                      <button
                                        className={`card-info-btn ${isExpanded ? 'btn-close-red' : 'btn-info-aqua'}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedCardType(isExpanded ? null : suggestion.type);
                                        }}
                                        title={isExpanded ? "Close explanation" : "Show explanation"}
                                      >
                                        {isExpanded ? <X size={16} /> : <Info size={16} />}
                                      </button>

                                      <div className="icon-box-static" style={{ color: type.color }}>
                                        <Icon size={32} strokeWidth={1.5} />
                                      </div>
                                      <span className="type-label">{type.label}</span>

                                      {isExpanded && (
                                        <motion.div
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ delay: 0.1 }}
                                          className="suggestion-expanded-content"
                                        >
                                          <div className="suggestion-confidence">
                                            Confidence: <span>{suggestion.isManual ? "Manual Selection" : `${Math.round(suggestion.confidence * 100)}%`}</span>
                                          </div>
                                          <p className="suggestion-explanation">{suggestion.reason}</p>
                                        </motion.div>
                                      )}
                                    </motion.div>
                                  );
                                })}
                            </AnimatePresence>
                          </div>

                          {!expandedCardType && (
                            <button className="confirm-btn" onClick={handleProceed} style={{ marginTop: '2rem' }}>Proceed</button>
                          )}
                        </div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="all-diagrams-grid"
                        >
                          {diagramTypes.map((type) => (
                            <motion.div
                              key={type.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`type-card grid-card ${suggestedType === type.id ? 'highlight-border' : ''}`}
                              onClick={() => {
                                setSuggestedType(type.id);
                                setShowAll(false);
                              }}
                            >
                              <div className="icon-box-static" style={{ color: type.color }}>
                                <type.icon size={32} strokeWidth={1.5} />
                                {isBetaDiagram(type.id) && <span className="beta-icon-badge">Beta</span>}
                              </div>
                              <span className="type-label">{type.label}</span>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Main studio opens directly at root */}
        <Route path="/" element={<DiagramsPage />} />
        <Route path="/diagrams" element={<DiagramsPage />} />
        
        {/* Essential retained pages */}
        <Route path="/myspace" element={<MySpace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/share/:diagramId" element={<ShareDiagramRoute />} />
        
        {/* Catch-all redirect to studio */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
