import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Edit, Plus, Check, ConstructionIcon, ShareIcon } from './googleIcons';
import { auth, onAuthStateChanged, isAuthInitialized } from './firebaseAuth';
import { db } from './firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import ProfileDropdown from './ProfileDropdown';
import ShareModal from './ShareModal';

const getLocalSavedDiagrams = () => {
  try {
    const localData = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
    const deletedIds = new Set(JSON.parse(localStorage.getItem('arka_deleted_diagram_ids') || '[]'));
    const allHistory = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
    const mergedMap = new Map();

    (localData || []).forEach(d => {
      if (d && d.id && !deletedIds.has(d.id)) {
        mergedMap.set(d.id, d);
      }
    });

    (allHistory || []).forEach(d => {
      if (d && d.id && d.is_myspace_saved && !deletedIds.has(d.id) && !mergedMap.has(d.id)) {
        mergedMap.set(d.id, d);
      }
    });

    return Array.from(mergedMap.values()).sort((a, b) => {
      const timeA = new Date(a.updated_at || a.saved_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.saved_at || 0).getTime();
      return timeB - timeA;
    }).slice(0, 5);
  } catch {
    return [];
  }
};

const MySpace = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => auth.currentUser);
  const [loading, setLoading] = useState(false);
  const [isDiagramsLoading, setIsDiagramsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('my-diagrams'); // my-diagrams | shared
  const [savedDiagrams, setSavedDiagrams] = useState(() => getLocalSavedDiagrams());
  const [editingDiagramId, setEditingDiagramId] = useState(null);
  const [editTitleText, setEditTitleText] = useState('');
  const [sharingDiagram, setSharingDiagram] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadSavedDiagrams = async () => {
      const initialLocal = getLocalSavedDiagrams();
      setSavedDiagrams(initialLocal);
      const deletedIds = new Set(JSON.parse(localStorage.getItem('arka_deleted_diagram_ids') || '[]'));

      if (user?.uid) {
        try {
          const q = query(
            collection(db, 'diagrams'),
            where('uid', '==', user.uid)
          );
          const snapshot = await getDocs(q);
          const rawDocs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

          // Filter for diagrams marked as saved in MySpace
          const dbSaved = rawDocs.filter(d => d && d.id && d.is_myspace_saved === true && !deletedIds.has(d.id));

          // Merge with local items
          const mergedMap = new Map();
          dbSaved.forEach(d => mergedMap.set(d.id, d));

          initialLocal.forEach(localItem => {
            if (localItem && localItem.id && !deletedIds.has(localItem.id)) {
              const dbItem = mergedMap.get(localItem.id);
              if (!dbItem) {
                mergedMap.set(localItem.id, localItem);
                setDoc(doc(db, 'diagrams', localItem.id), {
                  id: localItem.id,
                  uid: user.uid,
                  prompt: localItem.prompt || 'Untitled Diagram',
                  code: localItem.code || '',
                  diagram_type: localItem.diagram_type || 'flowchart',
                  is_myspace_saved: true,
                  saved_at: localItem.saved_at || new Date().toISOString(),
                  updated_at: localItem.updated_at || new Date().toISOString()
                }, { merge: true }).catch(() => {});
              } else {
                const localTime = new Date(localItem.updated_at || localItem.saved_at || 0).getTime();
                const dbTime = new Date(dbItem.updated_at || dbItem.saved_at || 0).getTime();
                if (localTime >= dbTime) {
                  mergedMap.set(localItem.id, { ...dbItem, ...localItem });
                }
              }
            }
          });

          const sortedList = Array.from(mergedMap.values()).sort((a, b) => {
            const timeA = new Date(a.updated_at || a.saved_at || 0).getTime();
            const timeB = new Date(b.updated_at || b.saved_at || 0).getTime();
            return timeB - timeA;
          }).slice(0, 5);

          setSavedDiagrams(sortedList);
          localStorage.setItem('arka_myspace_saved_diagrams', JSON.stringify(sortedList));
        } catch (err) {
          console.warn("Firestore sync skipped, keeping local MySpace diagrams:", err);
          setSavedDiagrams(initialLocal);
        } finally {
          setIsDiagramsLoading(false);
        }
      } else {
        setIsDiagramsLoading(false);
      }
    };

    loadSavedDiagrams();

    window.addEventListener('storage', loadSavedDiagrams);
    window.addEventListener('arka_myspace_updated', loadSavedDiagrams);
    return () => {
      window.removeEventListener('storage', loadSavedDiagrams);
      window.removeEventListener('arka_myspace_updated', loadSavedDiagrams);
    };
  }, [user]);

  const handleStartRename = (e, diagram) => {
    e.stopPropagation();
    setEditingDiagramId(diagram.id);
    setEditTitleText(diagram.prompt || 'Untitled Diagram');
  };

  const handleSaveRename = async (idToRename, newTitle) => {
    const trimmedTitle = newTitle.trim() || 'Untitled Diagram';
    const updated = savedDiagrams.map(d => d.id === idToRename ? { ...d, prompt: trimmedTitle } : d);
    setSavedDiagrams(updated);
    localStorage.setItem('arka_myspace_saved_diagrams', JSON.stringify(updated));
    setEditingDiagramId(null);

    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('arka_myspace_updated'));

    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'diagrams', idToRename), {
          prompt: trimmedTitle,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error renaming diagram in database:", err);
      }
    }
  };

  const handleOpenDiagram = (diagram) => {
    if (editingDiagramId === diagram.id) return;
    localStorage.setItem('arka_last_mermaid_code', diagram.code || '');
    localStorage.setItem('arka_prompt', diagram.prompt || '');
    localStorage.setItem('arka_diagramId', diagram.id);
    localStorage.setItem('arka_diagramType', diagram.diagram_type || 'flowchart');
    localStorage.setItem('arka_viewState', 'arena');
    navigate('/diagrams');
  };

  const handleOpenShare = (e, diagram) => {
    e.stopPropagation();
    setSharingDiagram(diagram);
  };

  const handleNewDiagram = () => {
    localStorage.removeItem('arka_prompt');
    localStorage.removeItem('arka_last_mermaid_code');
    localStorage.removeItem('arka_diagramId');
    localStorage.removeItem('arka_diagramType');
    localStorage.removeItem('arka_context_attachments');
    localStorage.removeItem('arka_last_github_repo');
    localStorage.setItem('arka_viewState', 'input');
    navigate('/diagrams');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', color: '#0f172a' }}
    >
      
      {/* Top Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        height: '62px',
        boxSizing: 'border-box',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            className="nav-btn-main" 
            onClick={() => navigate('/')} 
            title="Back to Generator"
            style={{ borderRadius: '50%', height: '38px', width: '38px', border: '1px solid #e5e7eb', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s ease' }}
          >
            <ChevronLeft size={20} color="#0f172a" />
          </button>
          <span style={{ fontFamily: 'var(--font-logo)', fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px', color: '#0f172a' }}>
            MY SPACE
          </span>
        </div>

        {/* Profile Dropdown placed cleanly in right corner matching App and Arena */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ProfileDropdown />
        </div>
      </header>

      {/* Main Page Layout Container (Permanent inline sidebar + Content) */}
      <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Permanent Inline Sidebar */}
        <aside
          style={{
            width: '260px',
            height: 'calc(100vh - 62px)',
            position: 'sticky',
            top: '62px',
            background: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ padding: '1.5rem 1.25rem', width: '260px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.85rem', paddingLeft: '0.4rem' }}>
              Navigation
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <button
                onClick={() => setActiveTab('my-diagrams')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 0.9rem',
                  background: activeTab === 'my-diagrams' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.92rem',
                  fontWeight: activeTab === 'my-diagrams' ? 700 : 500,
                  color: activeTab === 'my-diagrams' ? '#0f172a' : '#475569',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>My Diagrams</span>
              </button>

              <button
                onClick={() => setActiveTab('shared')}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.75rem 0.9rem',
                  background: activeTab === 'shared' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.92rem',
                  fontWeight: activeTab === 'shared' ? 700 : 500,
                  color: activeTab === 'shared' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Shared with me</span>
              </button>
            </nav>
          </div>

          {/* Space Storage Capacity Bar - Pinned to bottom */}
          <div style={{ padding: '1.25rem 1.25rem', borderTop: '1px solid #f1f5f9', width: '260px', boxSizing: 'border-box', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
              <span>Space Storage</span>
              <span>{savedDiagrams.length} / 5</span>
            </div>
            <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(savedDiagrams.length / 5) * 100}%`,
                  background: savedDiagrams.length >= 5 ? '#ef4444' : '#10b981',
                  borderRadius: '10px',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main style={{ flex: 1, padding: '2.5rem 3rem 4rem', minWidth: 0, overflowY: 'auto' }}>
          {activeTab === 'my-diagrams' ? (
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>My Diagrams</h2>
                  <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                    Saved diagrams in your space
                  </p>
                </div>
                <button
                  onClick={handleNewDiagram}
                  style={{
                    padding: '0.6rem 1.15rem',
                    borderRadius: '10px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    boxShadow: '0 2px 8px rgba(15,23,42,0.15)',
                    transition: 'all 0.18s ease'
                  }}
                >
                  <Plus size={16} /> New Diagram
                </button>
              </div>

              {isDiagramsLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.35rem' }}>
                  {[1, 2, 3].map(n => (
                    <div
                      key={n}
                      style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #e2e8f0',
                        padding: '1.35rem',
                        height: '140px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        overflow: 'hidden'
                      }}
                    >
                      <div>
                        <div className="skeleton-shimmer" style={{ width: '80px', height: '20px', borderRadius: '6px', marginBottom: '0.85rem' }} />
                        <div className="skeleton-shimmer" style={{ width: '85%', height: '16px', borderRadius: '4px', marginBottom: '0.5rem' }} />
                        <div className="skeleton-shimmer" style={{ width: '60%', height: '16px', borderRadius: '4px' }} />
                      </div>
                      <div className="skeleton-shimmer" style={{ width: '100px', height: '12px', borderRadius: '4px' }} />
                    </div>
                  ))}
                </div>
              ) : savedDiagrams.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                  style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '3.5rem 2rem', textAlign: 'center', color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
                >
                  <p style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>No diagrams saved to My Space yet.</p>
                  <p style={{ margin: '0 0 1.75rem', fontSize: '0.88rem', color: '#64748b' }}>Open the Arena and click <strong>"Save diagram to space"</strong> to keep up to 5 diagrams here.</p>
                  <button
                    onClick={handleNewDiagram}
                    style={{ padding: '0.65rem 1.35rem', borderRadius: '10px', background: '#0f172a', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
                  >
                    Go to Arena
                  </button>
                </motion.div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.35rem' }}>
                  <AnimatePresence mode="popLayout">
                    {savedDiagrams.map((diagram) => (
                      <motion.div
                        layout="position"
                        key={diagram.id}
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', duration: 0.32, bounce: 0.08 }}
                        onClick={() => handleOpenDiagram(diagram)}
                        style={{
                          background: '#ffffff',
                          borderRadius: '14px',
                          border: '1px solid #e2e8f0',
                          padding: '1.35rem',
                          minHeight: '160px',
                          cursor: 'pointer',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                          transition: 'border-color 0.18s ease, box-shadow 0.18s ease, transform 0.15s var(--ease-out-snappy)',
                          boxSizing: 'border-box'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.borderColor = '#0f172a';
                          e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(15,23,42,0.12)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.2rem 0.55rem', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {diagram.diagram_type || 'Diagram'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                onClick={(e) => handleOpenShare(e, diagram)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  padding: '0.3rem',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseOver={e => {
                                  e.currentTarget.style.color = '#0f172a';
                                  e.currentTarget.style.background = '#f1f5f9';
                                }}
                                onMouseOut={e => {
                                  e.currentTarget.style.color = '#94a3b8';
                                  e.currentTarget.style.background = 'transparent';
                                }}
                                title="Share diagram via link"
                              >
                                <ShareIcon size={15} />
                              </button>

                              <button
                                onClick={(e) => handleStartRename(e, diagram)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  padding: '0.3rem',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition: 'all 0.2s ease',
                                  opacity: editingDiagramId === diagram.id ? 0 : 1,
                                  pointerEvents: editingDiagramId === diagram.id ? 'none' : 'auto'
                                }}
                                onMouseOver={e => {
                                  if (editingDiagramId !== diagram.id) {
                                    e.currentTarget.style.color = '#0f172a';
                                    e.currentTarget.style.background = '#f1f5f9';
                                  }
                                }}
                                onMouseOut={e => {
                                  if (editingDiagramId !== diagram.id) {
                                    e.currentTarget.style.color = '#94a3b8';
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                title="Rename diagram"
                              >
                                <Edit size={16} />
                              </button>
                            </div>
                          </div>

                          <div style={{ minHeight: '44px', display: 'flex', alignItems: 'center', width: '100%' }}>
                            <AnimatePresence mode="wait" initial={false}>
                              {editingDiagramId === diagram.id ? (
                                <motion.div
                                  key="edit-box"
                                  initial={{ opacity: 0, scale: 0.97, y: -2 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.97, y: 2 }}
                                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%' }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <input
                                    type="text"
                                    value={editTitleText}
                                    onChange={e => setEditTitleText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveRename(diagram.id, editTitleText);
                                      if (e.key === 'Escape') setEditingDiagramId(null);
                                    }}
                                    autoFocus
                                    style={{
                                      flex: 1,
                                      padding: '0.4rem 0.65rem',
                                      borderRadius: '8px',
                                      border: '1.5px solid #0f172a',
                                      fontSize: '0.9rem',
                                      fontWeight: 600,
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                      boxShadow: '0 2px 6px rgba(15,23,42,0.06)'
                                    }}
                                  />
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveRename(diagram.id, editTitleText);
                                    }}
                                    style={{
                                      padding: '0.4rem 0.65rem',
                                      borderRadius: '8px',
                                      background: '#0f172a',
                                      color: '#ffffff',
                                      border: 'none',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0
                                    }}
                                    title="Save name"
                                  >
                                    <Check size={14} />
                                  </motion.button>
                                </motion.div>
                              ) : (
                                <motion.h4
                                  key="title-view"
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                                  style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', width: '100%' }}
                                >
                                  {diagram.prompt || 'Untitled Diagram'}
                                </motion.h4>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Saved {new Date(diagram.saved_at || diagram.updated_at || Date.now()).toLocaleDateString()}</span>
                          <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.78rem' }}>Open →</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Shared Diagrams</h2>
                <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                  Diagrams you saved from shared links or collaborate on
                </p>
              </div>

              {savedDiagrams.filter(d => Boolean(d.forked_from || d.is_shared)).length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.35rem' }}>
                  {savedDiagrams.filter(d => Boolean(d.forked_from || d.is_shared)).map((diagram) => (
                    <motion.div
                      layout="position"
                      key={diagram.id}
                      initial={{ opacity: 0, scale: 0.96, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      onClick={() => handleOpenDiagram(diagram)}
                      style={{
                        background: '#ffffff',
                        borderRadius: '14px',
                        border: '1px solid #e2e8f0',
                        padding: '1.35rem',
                        minHeight: '160px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '0.2rem 0.55rem', borderRadius: '6px', textTransform: 'uppercase' }}>
                            {diagram.diagram_type || 'Diagram'} · Saved Copy
                          </span>
                          <button
                            onClick={(e) => handleOpenShare(e, diagram)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.3rem', borderRadius: '6px' }}
                            title="Share diagram"
                          >
                            <ShareIcon size={15} />
                          </button>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#0f172a' }}>
                          {diagram.prompt || 'Untitled Diagram'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', marginTop: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                        <span>Saved {new Date(diagram.saved_at || diagram.updated_at || Date.now()).toLocaleDateString()}</span>
                        <span style={{ color: '#0f172a', fontWeight: 600 }}>Open →</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '3.5rem 2rem', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>No shared diagrams saved yet.</p>
                  <p style={{ margin: '0 auto 1.5rem', maxWidth: '420px', fontSize: '0.88rem', color: '#64748b' }}>
                    When colleagues or friends share a diagram link with you, click <strong>"Save to Space"</strong> to keep a customized copy here.
                  </p>
                  <button
                    onClick={() => navigate('/diagrams')}
                    style={{ padding: '0.65rem 1.35rem', borderRadius: '10px', background: '#0f172a', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
                  >
                    Create a Diagram
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Share Modal */}
      {sharingDiagram && (
        <ShareModal
          isOpen={Boolean(sharingDiagram)}
          onClose={() => setSharingDiagram(null)}
          diagramId={sharingDiagram.id}
          diagramPrompt={sharingDiagram.prompt || 'Untitled Diagram'}
          diagramType={sharingDiagram.diagram_type || 'flowchart'}
          mermaidCode={sharingDiagram.code || sharingDiagram.mermaid_code || ''}
          isPublic={sharingDiagram.is_public === true}
          onTogglePublic={(newStatus) => {
            setSharingDiagram(prev => prev ? { ...prev, is_public: newStatus } : null);
            setSavedDiagrams(prev => prev.map(d => d.id === sharingDiagram.id ? { ...d, is_public: newStatus } : d));
          }}
          currentUser={user}
        />
      )}
    </motion.div>
  );
};

export default MySpace;
