import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { auth } from './firebaseAuth';

const ProfileDropdown = () => {
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const user = auth.currentUser;

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', minWidth: '38px', minHeight: '38px', flexShrink: 0 }}>
      <button 
        type="button"
        className="profile-btn" 
        style={{
          width: '38px',
          height: '38px',
          minWidth: '38px',
          minHeight: '38px',
          maxWidth: '38px',
          maxHeight: '38px',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          overflow: 'hidden',
          cursor: 'pointer',
          border: '1px solid #e5e7eb',
          padding: 0,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxSizing: 'border-box',
          background: '#ffffff'
        }} 
        onClick={() => setProfileOpen(!profileOpen)}
        title="Menu"
      >
        <img 
          src={user?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=hackathon'} 
          alt="Profile" 
          style={{
            width: '100%',
            height: '100%',
            minWidth: '100%',
            minHeight: '100%',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
            flexShrink: 0
          }} 
        />
      </button>

      <AnimatePresence>
        {profileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', duration: 0.22, bounce: 0.08 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              boxShadow: '0 16px 36px -8px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
              width: '210px',
              padding: '0.65rem',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
              transformOrigin: 'top right'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.5rem 0.75rem 0.5rem', borderBottom: '1px solid #e5e7eb', marginBottom: '0.25rem' }}>
              <img 
                src={user?.photoURL || 'https://api.dicebear.com/7.x/bottts/svg?seed=hackathon'} 
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #e5e7eb' }} 
              />
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.displayName || 'Builder'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}>
                  Workspace
                </div>
              </div>
            </div>

            <button
              onClick={() => { setProfileOpen(false); navigate('/myspace'); }}
              style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 500, color: '#111827', transition: 'all 0.15s ease' }}
              onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              My Space 🚀
            </button>

            <button
              onClick={() => { setProfileOpen(false); navigate('/settings'); }}
              style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 500, color: '#111827', transition: 'all 0.15s ease' }}
              onMouseOver={e => e.currentTarget.style.background = '#f3f4f6'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Settings ⚙️
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileDropdown;
