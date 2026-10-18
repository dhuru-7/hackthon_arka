import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2 } from './googleIcons';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebaseAuth';
import './ArenaFeedbackModal.css';

const CATEGORIES = [
  { id: 'idea', label: 'Idea', placeholder: 'What capability or improvement would you like to see?' },
  { id: 'design', label: 'Design', placeholder: 'Describe the layout, spacing, or styling issue...' },
  { id: 'bug', label: 'Bug', placeholder: 'What went wrong? Tell us what happened...' },
  { id: 'agent', label: 'Agent', placeholder: 'Describe the issue with the AI chat response or diagram edits...' },
];

export default function ArenaFeedbackModal({
  isOpen,
  onClose,
  diagramContext = {}
}) {
  const [category, setCategory] = useState('idea');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const textareaRef = useRef(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSubmitted(false);
      setErrorMsg('');
      const t = setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 120);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const activeCategory = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      setErrorMsg('Please enter your feedback before sending.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        category,
        feedback: trimmed,
        diagram_context: {
          diagram_id: diagramContext.diagramId || null,
          diagram_type: diagramContext.diagramType || null,
          layout_engine: diagramContext.layoutEngine || null,
          has_render_error: Boolean(diagramContext.hasRenderError),
          agent_messages_count: Number(diagramContext.agentMessagesCount) || 0,
          prompt_snippet: diagramContext.prompt ? String(diagramContext.prompt).slice(0, 300) : null,
          code_snippet: diagramContext.mermaidCode ? String(diagramContext.mermaidCode).slice(0, 600) : null,
        },
        uid: auth?.currentUser?.uid || null,
        user_email: auth?.currentUser?.email || null,
        user_name: auth?.currentUser?.displayName || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        created_at: serverTimestamp(),
      };

      await addDoc(collection(db, 'arena_feedback'), payload);

      setIsSubmitted(true);
      setFeedbackText('');

      // Auto close after brief success confirmation
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
      }, 1400);
    } catch (err) {
      console.error('Failed to save feedback:', err);
      setErrorMsg('Could not send feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="apple-feedback-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: 'easeIn' } }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          <motion.div
            className="apple-feedback-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apple-feedback-title"
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.1, ease: 'easeIn' } }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="apple-feedback-header">
              <h2 id="apple-feedback-title" className="apple-feedback-title">Feedback</h2>
              <button
                type="button"
                className="apple-feedback-close-btn"
                onClick={onClose}
                aria-label="Close"
                disabled={isSubmitting}
              >
                <X size={16} />
              </button>
            </div>

            {isSubmitted ? (
              <motion.div
                className="apple-feedback-success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.18 }}
              >
                <div className="apple-feedback-success-icon">
                  <Check size={22} />
                </div>
                <span className="apple-feedback-success-text">Thank you. Your feedback was received.</span>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="apple-feedback-form">
                {/* Segmented Pill Control */}
                <div className="apple-feedback-segments" role="radiogroup" aria-label="Feedback category">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`apple-feedback-segment-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setCategory(cat.id);
                          setErrorMsg('');
                        }}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="apple-feedback-active-pill"
                            className="apple-feedback-active-indicator"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <span className="apple-feedback-segment-label">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Input area */}
                <div className="apple-feedback-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    className="apple-feedback-textarea"
                    rows={4}
                    value={feedbackText}
                    onChange={(e) => {
                      setFeedbackText(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder={activeCategory.placeholder}
                    maxLength={2000}
                    disabled={isSubmitting}
                  />
                </div>

                {errorMsg && (
                  <div className="apple-feedback-error">{errorMsg}</div>
                )}

                {/* Actions */}
                <div className="apple-feedback-actions">
                  <button
                    type="button"
                    className="apple-feedback-cancel-btn"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="apple-feedback-submit-btn"
                    disabled={isSubmitting || !feedbackText.trim()}
                  >
                    {isSubmitting ? (
                      <Loader2 size={16} className="apple-feedback-spinner" />
                    ) : (
                      'Send'
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
