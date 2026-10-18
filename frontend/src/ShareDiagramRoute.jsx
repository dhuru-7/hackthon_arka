import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { auth, onAuthStateChanged } from './firebaseAuth';
import Arena from './Arena';
import { ArkaLogo, LockIcon, Plus, ChevronLeft, Loader2, ArrowRight } from './googleIcons';
import { playDiagramGeneratedSound } from './soundService';

export default function ShareDiagramRoute() {
  const { diagramId } = useParams();
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(() => auth?.currentUser);
  const [loading, setLoading] = useState(true);
  const [diagramData, setDiagramData] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null); // 'not_found' | 'private' | 'error'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const fetchSharedDiagram = async () => {
      if (!diagramId) {
        setErrorStatus('not_found');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorStatus(null);

      try {
        const docRef = doc(db, 'diagrams', diagramId);
        const docSnap = await getDoc(docRef);

        if (isCancelled) return;

        if (!docSnap.exists()) {
          setErrorStatus('not_found');
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        const viewerUid = auth?.currentUser?.uid || currentUser?.uid;
        const isAuthor = viewerUid && data.uid && viewerUid === data.uid;

        // Check privacy access: private unless is_public is explicitly true, unless viewer is author
        if (data.is_public !== true && !isAuthor) {
          setErrorStatus('private');
          setDiagramData(null);
          setLoading(false);
          return;
        }

        let creatorName = data.creator_name || data.author_name;
        let creatorAvatar = data.creator_avatar || data.author_avatar;

        if ((!creatorName || !creatorAvatar) && data.uid) {
          try {
            const userDocSnap = await getDoc(doc(db, 'users', data.uid));
            if (userDocSnap.exists()) {
              const uData = userDocSnap.data();
              if (!creatorName) creatorName = uData.name || uData.displayName || (uData.email ? uData.email.split('@')[0] : 'Creator');
              if (!creatorAvatar) creatorAvatar = uData.avatar || uData.photoURL || '';
            }
          } catch (profileErr) {
            console.warn('Could not fetch creator profile:', profileErr);
          }
        }

        setDiagramData({
          id: docSnap.id,
          ...data,
          creator_name: creatorName || 'Creator',
          creator_avatar: creatorAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${data.uid || 'creator'}`
        });

        // Set dynamic document title for browser tabs & social link cards
        if (data.prompt) {
          const cleanPrompt = data.prompt.replace(/\[GIT_REPO:.*?\]/g, '').trim();
          document.title = `${cleanPrompt.slice(0, 50)} - Arka Diagrams`;
        } else {
          document.title = 'Shared Diagram - Arka Diagrams';
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching shared diagram:', err);
        if (!isCancelled) {
          if (
            err?.code === 'permission-denied' ||
            err?.message?.includes('permission') ||
            err?.message?.includes('Missing or insufficient permissions')
          ) {
            setErrorStatus('private');
            setDiagramData(null);
          } else {
            setErrorStatus('error');
          }
          setLoading(false);
        }
      }
    };

    fetchSharedDiagram();

    return () => {
      isCancelled = true;
    };
  }, [diagramId, currentUser]);

  // Handle forking diagram to current user's MySpace / Library
  const handleForkDiagram = useCallback(async (currentCode) => {
    const user = auth?.currentUser || currentUser;
    if (!user || !user.uid || !diagramData) return null;

    try {
      const newDiagramId = `diagram_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cleanPrompt = (diagramData.prompt || 'Untitled Diagram').replace(/\[GIT_REPO:.*?\]/g, '').trim();

      const newDoc = {
        id: newDiagramId,
        uid: user.uid,
        prompt: cleanPrompt,
        diagram_type: diagramData.diagram_type || 'flowchart',
        code: currentCode || diagramData.code || '',
        is_myspace_saved: true,
        is_public: false,
        forked_from: diagramId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        creator_name: user.displayName || user.email?.split('@')[0] || 'User',
        creator_avatar: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`
      };

      // 1. Write to Firestore
      await setDoc(doc(db, 'diagrams', newDiagramId), newDoc);

      // 2. Add to Local Storage History & MySpace
      try {
        const historyList = JSON.parse(localStorage.getItem('arka_all_diagram_history') || '[]');
        historyList.unshift(newDoc);
        localStorage.setItem('arka_all_diagram_history', JSON.stringify(historyList.slice(0, 50)));

        const savedList = JSON.parse(localStorage.getItem('arka_myspace_saved_diagrams') || '[]');
        savedList.unshift(newDoc);
        localStorage.setItem('arka_myspace_saved_diagrams', JSON.stringify(savedList.slice(0, 5)));

        localStorage.setItem('arka_diagramId', newDiagramId);
        localStorage.setItem('arka_last_mermaid_code', newDoc.code);
        localStorage.setItem('arka_prompt', newDoc.prompt);
        localStorage.setItem('arka_diagramType', newDoc.diagram_type);

        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('arka_myspace_updated'));
      } catch (storageErr) {
        console.warn('Local storage sync warning:', storageErr);
      }

      try {
        playDiagramGeneratedSound();
      } catch {}

      return newDiagramId;
    } catch (err) {
      console.error('Error forking diagram:', err);
      throw err;
    }
  }, [currentUser, diagramData, diagramId]);

  const sharedCreator = useMemo(() => {
    if (!diagramData) return null;
    return {
      name: diagramData.creator_name || diagramData.author_name || 'Creator',
      avatar: diagramData.creator_avatar || diagramData.author_avatar || '',
      email: diagramData.creator_email || '',
      uid: diagramData.uid
    };
  }, [diagramData]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleShowHistory = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // 1. Loading State
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        fontFamily: 'Space Grotesk, -apple-system, sans-serif'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
          <div className="loader"></div>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#64748b', letterSpacing: '0.05em' }}>
            LOADING SHARED DIAGRAM...
          </span>
        </div>
      </div>
    );
  }

  // 2. Private Diagram State
  if (errorStatus === 'private') {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        padding: '24px',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      }}>
        <div style={{
          maxWidth: '460px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 48px -12px rgba(15, 23, 42, 0.08)',
          padding: '36px 32px',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: '#fef3c7',
            border: '1px solid #fde68a',
            color: '#b45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto'
          }}>
            <LockIcon size={30} />
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
            Private Diagram
          </h2>
          <p style={{ fontSize: '14.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 28px 0' }}>
            This diagram is private. Only the author can access it — no one else can view this diagram, whether signed up or not.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              onClick={() => navigate(currentUser ? '/diagrams' : '/')}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {currentUser ? 'Go to My Space' : 'Create Your Own Diagram'}
            </button>

          </div>
        </div>
      </div>
    );
  }

  // 3. Not Found / Error State
  if (errorStatus === 'not_found' || errorStatus === 'error' || !diagramData) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        padding: '24px',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      }}>
        <div style={{
          maxWidth: '460px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 48px -12px rgba(15, 23, 42, 0.08)',
          padding: '36px 32px',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <ArkaLogo size={42} />
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-0.02em' }}>
            Diagram Not Found
          </h2>
          <p style={{ fontSize: '14.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 28px 0' }}>
            This diagram link may have expired, or the diagram was removed by its author.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Generate New Diagram
            </button>
            <button
              type="button"
              onClick={() => navigate('/templates')}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#f1f5f9',
                color: '#334155',
                fontSize: '14px',
                fontWeight: 600,
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Explore Templates
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Render Arena with Shared View Mode
  const viewerUid = currentUser?.uid;
  const isOwner = Boolean(viewerUid && diagramData?.uid && viewerUid === diagramData.uid);

  return (
    <div className="arena-full-page">
      <Arena
        prompt={diagramData.prompt}
        diagramType={diagramData.diagram_type || 'flowchart'}
        diagramId={diagramData.id}
        initialMermaidCode={diagramData.code}
        isSharedView={true}
        isOwner={isOwner}
        sharedCreator={sharedCreator}
        isPublic={diagramData.is_public === true}
        onForkDiagram={handleForkDiagram}
        onBack={handleBack}
        onShowHistory={handleShowHistory}
      />
    </div>
  );
}
