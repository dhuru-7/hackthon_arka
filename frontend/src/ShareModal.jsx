import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, CopyIcon, LinkIcon, LockIcon, GithubIcon } from './googleIcons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import './ShareModal.css';

const ExpandIcon = ({ size = 12, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export default function ShareModal({
  isOpen,
  onClose,
  diagramId,
  diagramPrompt = 'Untitled Diagram',
  diagramType = 'flowchart',
  mermaidCode = '',
  isPublic = false,
  onTogglePublic,
  isSyncing = false,
  currentUser,
  isOwner = true
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedGithub, setCopiedGithub] = useState(false);
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [activeTab, setActiveTab] = useState('link'); // 'link' | 'github'
  const [githubFormat, setGithubFormat] = useState('mermaid'); // 'mermaid' | 'badge'
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setLocalIsPublic(isPublic);
  }, [isPublic]);

  // Handle ESC key to dismiss (first collapse expanded view, then close modal)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExpanded, onClose]);

  // Reset expanded view if modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  const shareUrl = diagramId ? `${window.location.origin}/share/${diagramId}` : '';

  const cleanTitle = (diagramPrompt && diagramPrompt !== 'Untitled Diagram')
    ? diagramPrompt.slice(0, 32)
    : 'ARKA Diagram';

  const getMarkdownSnippet = () => {
    if (!shareUrl) return '';

    if (githubFormat === 'badge') {
      const label = encodeURIComponent(cleanTitle.replace(/-/g, ' '));
      return `[![${cleanTitle}](https://img.shields.io/badge/${label}-ARKA%20Diagrams-000000?style=flat)](${shareUrl})`;
    }

    // Default: Native GitHub Mermaid block with edit attribution link
    const code = mermaidCode && mermaidCode.trim()
      ? mermaidCode.trim()
      : 'graph TD\n    A[Start] --> B[ARKA Diagram]';
    return `\`\`\`mermaid
${code}
\`\`\`

<sub>[Edit this diagram in ARKA](${shareUrl})</sub>`;
  };

  const copyToClipboard = async (text, onSuccess) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      onSuccess();
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl || !localIsPublic) return;
    copyToClipboard(shareUrl, () => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleCopyGithub = () => {
    if (!shareUrl || !localIsPublic) return;
    const snippet = getMarkdownSnippet();
    copyToClipboard(snippet, () => {
      setCopiedGithub(true);
      setTimeout(() => setCopiedGithub(false), 2000);
    });
  };

  const handleSetPublic = async (nextPublic) => {
    if (nextPublic === localIsPublic) return;
    setLocalIsPublic(nextPublic);

    if (isOwner && diagramId) {
      try {
        const diagramRef = doc(db, 'diagrams', diagramId);
        await updateDoc(diagramRef, {
          is_public: nextPublic,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error updating visibility:', err);
        setLocalIsPublic(!nextPublic);
      }
    }
    if (onTogglePublic) {
      onTogglePublic(nextPublic);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="apple-share-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          <motion.div
            className="apple-share-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apple-share-title"
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.1, ease: 'easeIn' } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="apple-share-header">
              <h2 id="apple-share-title" className="apple-share-title">Share Diagram</h2>
              <button
                type="button"
                className="apple-share-close-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Apple iOS ON / OFF Toggle Switch Row */}
            <div className="apple-share-toggle-row">
              <div className="apple-share-toggle-info">
                <span className="apple-share-toggle-title">Share via link</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localIsPublic}
                className={`apple-ios-switch ${localIsPublic ? 'is-on' : 'is-off'}`}
                style={{ justifyContent: localIsPublic ? 'flex-end' : 'flex-start' }}
                onClick={() => handleSetPublic(!localIsPublic)}
                aria-label="Toggle public link sharing"
              >
                <motion.div
                  layout
                  className="apple-ios-switch-thumb"
                  transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                />
              </button>
            </div>

            {/* Fixed-Height Stable Content Section (Zero Jitter, Zero Layout Shift) */}
            <div className="apple-share-body">
              {isSyncing ? (
                <div className="apple-share-skeleton-wrap">
                  <div className="apple-share-shimmer apple-share-shimmer-input" />
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {localIsPublic ? (
                    <motion.div
                      key="share-active-pane"
                      className="apple-share-pane"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                      {/* Segmented Control */}
                      <div className="share-segmented-control">
                        <button
                          type="button"
                          className={`share-segment-btn ${activeTab === 'link' ? 'is-active active' : ''}`}
                          onClick={() => setActiveTab('link')}
                        >
                          <LinkIcon size={13} className="share-segment-icon" />
                          <span>Link</span>
                        </button>
                        <button
                          type="button"
                          className={`share-segment-btn ${activeTab === 'github' ? 'is-active active' : ''}`}
                          onClick={() => setActiveTab('github')}
                        >
                          <GithubIcon size={13} className="share-segment-icon" />
                          <span>GitHub README</span>
                        </button>
                      </div>

                      {/* Tab 1: Share Link */}
                      {activeTab === 'link' ? (
                        <div className="apple-share-tab-content">
                          <div className="apple-share-input-row">
                            <div className="apple-share-input-wrapper">
                              <LinkIcon size={14} className="apple-share-link-icon" />
                              <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                className="apple-share-input"
                                onClick={(e) => e.target.select()}
                                aria-label="Shareable link"
                              />
                            </div>
                            <button
                              type="button"
                              className={`apple-share-copy-btn ${copiedLink ? 'is-copied' : ''}`}
                              onClick={handleCopyLink}
                            >
                              {copiedLink ? (
                                <>
                                  <Check size={14} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon size={14} />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <span className="apple-share-helper-text">
                            Anyone with this link can view this diagram.
                          </span>
                        </div>
                      ) : (
                        /* Tab 2: GitHub README Embed */
                        <div className="apple-share-tab-content">
                          <div className="apple-share-gh-bar">
                            <div className="apple-share-gh-format-pills">
                              <button
                                type="button"
                                className={`apple-share-format-pill ${githubFormat === 'mermaid' ? 'is-active' : ''}`}
                                onClick={() => setGithubFormat('mermaid')}
                              >
                                Mermaid
                              </button>
                              <button
                                type="button"
                                className={`apple-share-format-pill ${githubFormat === 'badge' ? 'is-active' : ''}`}
                                onClick={() => setGithubFormat('badge')}
                              >
                                Badge
                              </button>
                            </div>
                            <button
                              type="button"
                              className={`apple-share-copy-btn apple-share-copy-gh-btn ${copiedGithub ? 'is-copied' : ''}`}
                              onClick={handleCopyGithub}
                            >
                              {copiedGithub ? (
                                <>
                                  <Check size={13} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon size={13} />
                                  <span>{githubFormat === 'mermaid' ? 'Copy Markdown' : 'Copy Badge'}</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div
                            className="apple-share-code-box"
                            onClick={(e) => {
                              const range = document.createRange();
                              range.selectNodeContents(e.currentTarget);
                              const sel = window.getSelection();
                              sel.removeAllRanges();
                              sel.addRange(range);
                            }}
                          >
                            <code>{getMarkdownSnippet()}</code>
                            <button
                              type="button"
                              className="apple-share-expand-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(true);
                              }}
                              title="Expand snippet"
                              aria-label="Expand snippet preview"
                            >
                              <ExpandIcon size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="share-off-pane"
                      className="apple-share-pane apple-share-off-pane"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                    >
                      <div className="apple-share-off-icon-box">
                        <LockIcon size={15} />
                      </div>
                      <div className="apple-share-off-message">
                        <span className="apple-share-off-title">Link sharing is off</span>
                        <span className="apple-share-off-desc">Turn on above to generate a shareable link and GitHub embed.</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* Full-card Expanded Snippet View */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  className="apple-share-expanded-overlay"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="apple-share-expanded-header">
                    <div className="apple-share-expanded-title-group">
                      <span className="apple-share-expanded-title">GitHub README</span>
                      <div className="apple-share-gh-format-pills">
                        <button
                          type="button"
                          className={`apple-share-format-pill ${githubFormat === 'mermaid' ? 'is-active' : ''}`}
                          onClick={() => setGithubFormat('mermaid')}
                        >
                          Mermaid
                        </button>
                        <button
                          type="button"
                          className={`apple-share-format-pill ${githubFormat === 'badge' ? 'is-active' : ''}`}
                          onClick={() => setGithubFormat('badge')}
                        >
                          Badge
                        </button>
                      </div>
                    </div>

                    <div className="apple-share-expanded-actions">
                      <button
                        type="button"
                        className={`apple-share-copy-btn apple-share-copy-gh-btn ${copiedGithub ? 'is-copied' : ''}`}
                        onClick={handleCopyGithub}
                      >
                        {copiedGithub ? (
                          <>
                            <Check size={13} />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <CopyIcon size={13} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="apple-share-close-btn"
                        onClick={() => setIsExpanded(false)}
                        title="Collapse"
                        aria-label="Collapse"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div
                    className="apple-share-code-box is-expanded"
                    onClick={(e) => {
                      const range = document.createRange();
                      range.selectNodeContents(e.currentTarget);
                      const sel = window.getSelection();
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }}
                  >
                    <code>{getMarkdownSnippet()}</code>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
